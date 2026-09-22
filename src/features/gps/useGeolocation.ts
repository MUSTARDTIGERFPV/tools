import { useCallback, useEffect, useRef, useState } from "react";

export type SpeedSource = "device" | "derived" | "none";
export type HeadingSource = "device" | "derived" | "none";

export type Fix = {
  lat: number;
  lon: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  /** Position timestamp as reported by the provider. */
  timestamp: number;
  /** Wall clock time the callback actually fired. */
  receivedAt: number;
};

export type GeoError = {
  code: number;
  name: string;
  message: string;
  at: number;
};

export type GeoState = {
  supported: boolean;
  secureContext: boolean;
  permission: PermissionState | "unknown";
  watching: boolean;
  watchId: number | null;
  fix: Fix | null;
  error: GeoError | null;
  /** Metres per second, whichever source we settled on. */
  speed: number;
  speedSource: SpeedSource;
  heading: number | null;
  headingSource: HeadingSource;
  fixCount: number;
  /** Rolling deltas between consecutive callbacks, milliseconds. */
  intervals: number[];
  /** Last 90 speed samples in m/s, oldest first. */
  history: number[];
  maxSpeed: number;
  distance: number;
  movingMs: number;
  trackedMs: number;
  wakeLock: "unsupported" | "inactive" | "active" | "failed";
};

const errorNames: Record<number, string> = {
  1: "PERMISSION_DENIED",
  2: "POSITION_UNAVAILABLE",
  3: "TIMEOUT",
};

const historyLength = 90;
const intervalLength = 20;
/** Below this we treat the vehicle as stopped, so jitter does not count as movement. */
export const movingThreshold = 0.5;

export function haversine(a: Fix, b: Fix) {
  const r = 6371008.8;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a: Fix, b: Fix) {
  const toRad = Math.PI / 180;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

const initialState: GeoState = {
  supported: typeof navigator !== "undefined" && "geolocation" in navigator,
  secureContext: typeof window !== "undefined" && window.isSecureContext,
  permission: "unknown",
  watching: false,
  watchId: null,
  fix: null,
  error: null,
  speed: 0,
  speedSource: "none",
  heading: null,
  headingSource: "none",
  fixCount: 0,
  intervals: [],
  history: [],
  maxSpeed: 0,
  distance: 0,
  movingMs: 0,
  trackedMs: 0,
  wakeLock: typeof navigator !== "undefined" && "wakeLock" in navigator ? "inactive" : "unsupported",
};

export function useGeolocation() {
  const [state, setState] = useState<GeoState>(initialState);
  const watchRef = useRef<number | null>(null);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const firstFixRef = useRef<number | null>(null);

  useEffect(() => {
    if (!navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    const apply = () => setState((prev) => ({ ...prev, permission: status?.state ?? "unknown" }));

    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((result) => {
        status = result;
        apply();
        result.addEventListener("change", apply);
      })
      .catch(() => undefined);

    return () => status?.removeEventListener("change", apply);
  }, []);

  const onPosition = useCallback((position: GeolocationPosition) => {
    const receivedAt = Date.now();
    const c = position.coords;
    const fix: Fix = {
      lat: c.latitude,
      lon: c.longitude,
      accuracy: c.accuracy,
      altitude: c.altitude,
      altitudeAccuracy: c.altitudeAccuracy,
      heading: Number.isFinite(c.heading) ? c.heading : null,
      speed: Number.isFinite(c.speed) ? c.speed : null,
      timestamp: position.timestamp,
      receivedAt,
    };

    if (firstFixRef.current === null) firstFixRef.current = receivedAt;

    setState((prev) => {
      const previous = prev.fix;
      const dt = previous ? (receivedAt - previous.receivedAt) / 1000 : 0;
      const segment = previous ? haversine(previous, fix) : 0;

      let speed = 0;
      let speedSource: SpeedSource = "none";
      if (fix.speed !== null && fix.speed >= 0) {
        speed = fix.speed;
        speedSource = "device";
      } else if (previous && dt > 0.2) {
        speed = segment / dt;
        speedSource = "derived";
      }

      let heading = fix.heading;
      let headingSource: HeadingSource = heading === null ? "none" : "device";
      if (heading === null && previous && speed > movingThreshold) {
        heading = bearing(previous, fix);
        headingSource = "derived";
      }

      // Odometer gate. When the chip reports its own speed we trust it as the
      // motion detector, so walking pace still counts. When speed is derived
      // from position we also need the step to clear the fix noise, or a
      // stationary laptop walks the odometer upward on jitter alone. The upper
      // bound drops the teleports you get when the fix switches source.
      const credible =
        segment < 1000 &&
        fix.accuracy <= 50 &&
        speed > movingThreshold &&
        (speedSource === "device" || segment > Math.max(1, fix.accuracy / 4));

      return {
        ...prev,
        fix,
        error: null,
        speed,
        speedSource,
        heading,
        headingSource,
        fixCount: prev.fixCount + 1,
        intervals: previous
          ? [...prev.intervals, receivedAt - previous.receivedAt].slice(-intervalLength)
          : prev.intervals,
        history: [...prev.history, speed].slice(-historyLength),
        maxSpeed: Math.max(prev.maxSpeed, speed),
        distance: prev.distance + (credible ? segment : 0),
        // Tied to the same gate as the odometer so distance / moving time,
        // i.e. the average moving speed, stays internally consistent.
        movingMs: prev.movingMs + (credible && previous ? receivedAt - previous.receivedAt : 0),
        trackedMs: receivedAt - (firstFixRef.current ?? receivedAt),
      };
    });
  }, []);

  const onError = useCallback((error: GeolocationPositionError) => {
    setState((prev) => ({
      ...prev,
      error: {
        code: error.code,
        name: errorNames[error.code] ?? "UNKNOWN",
        message: error.message,
        at: Date.now(),
      },
    }));
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeRef.current?.release().catch(() => undefined);
    wakeRef.current = null;
    setState((prev) => (prev.wakeLock === "active" ? { ...prev, wakeLock: "inactive" } : prev));
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeRef.current = await navigator.wakeLock.request("screen");
      wakeRef.current.addEventListener("release", () =>
        setState((prev) => ({ ...prev, wakeLock: "inactive" })),
      );
      setState((prev) => ({ ...prev, wakeLock: "active" }));
    } catch {
      setState((prev) => ({ ...prev, wakeLock: "failed" }));
    }
  }, []);

  const stop = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    releaseWakeLock();
    setState((prev) => ({ ...prev, watching: false, watchId: null }));
  }, [releaseWakeLock]);

  const start = useCallback(() => {
    if (!navigator.geolocation || watchRef.current !== null) return;
    const id = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    });
    watchRef.current = id;
    firstFixRef.current = null;
    setState((prev) => ({ ...prev, watching: true, watchId: id, error: null }));
    void requestWakeLock();
  }, [onError, onPosition, requestWakeLock]);

  const resetTrip = useCallback(() => {
    firstFixRef.current = Date.now();
    setState((prev) => ({
      ...prev,
      distance: 0,
      maxSpeed: 0,
      movingMs: 0,
      trackedMs: 0,
      fixCount: 0,
      intervals: [],
      history: [],
    }));
  }, []);

  // The screen lock is dropped whenever the tab is backgrounded; take it back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && watchRef.current !== null) {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [requestWakeLock]);

  useEffect(() => stop, [stop]);

  return { state, start, stop, resetTrip };
}
