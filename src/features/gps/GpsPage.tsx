import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ResultTile } from "@/components/result-tile";
import { ToolPage } from "@/components/tool-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Gauge, Sparkline } from "@/features/gps/gauge";
import { movingThreshold, useGeolocation, type GeoState } from "@/features/gps/useGeolocation";

type UnitKey = "mph" | "kmh" | "kn" | "ms";

const units: Record<
  UnitKey,
  {
    label: string;
    /** Multiplier from metres per second. */
    factor: number;
    /** Gauge ranges, smallest first. */
    ladder: number[];
    distanceLabel: string;
    distanceFactor: number;
  }
> = {
  // Ladder steps are multiples of 8 so every dial label lands on a round number.
  mph: { label: "mph", factor: 2.236936, ladder: [16, 40, 80, 160, 240], distanceLabel: "mi", distanceFactor: 1 / 1609.344 },
  kmh: { label: "km/h", factor: 3.6, ladder: [24, 40, 80, 160, 320], distanceLabel: "km", distanceFactor: 1 / 1000 },
  kn: { label: "kn", factor: 1.943844, ladder: [16, 40, 80, 160, 240], distanceLabel: "NM", distanceFactor: 1 / 1852 },
  ms: { label: "m/s", factor: 1, ladder: [8, 16, 40, 80, 160], distanceLabel: "km", distanceFactor: 1 / 1000 },
};

const unitOrder: UnitKey[] = ["mph", "kmh", "kn", "ms"];
const storageKey = "gpsSpeedometerUnit";
const staleAfterMs = 5000;

export function GpsPage() {
  const { state, start, stop, resetTrip } = useGeolocation();
  const [unit, setUnit] = useState<UnitKey>("mph");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved && saved in units) setUnit(saved as UnitKey);
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, unit);
  }, [unit]);

  // Drives the "x s ago" counters, which have to keep moving between fixes.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  const u = units[unit];
  const speed = state.speed * u.factor;
  const maxSpeed = state.maxSpeed * u.factor;
  const scale = u.ladder.find((step) => Math.max(speed, maxSpeed) <= step * 0.95) ?? u.ladder[u.ladder.length - 1];
  // The tick can be sampled a hair before the fix lands, so clamp at zero.
  const age = state.fix ? Math.max(0, now - state.fix.receivedAt) : null;
  const stale = state.watching && age !== null && age > staleAfterMs;
  const avgMoving = state.movingMs > 0 ? (state.distance / (state.movingMs / 1000)) * u.factor : 0;
  const status = gaugeStatus(state, Boolean(stale));

  const cadence = useMemo(() => {
    if (state.intervals.length === 0) return null;
    const mean = state.intervals.reduce((sum, v) => sum + v, 0) / state.intervals.length;
    return { mean, hz: 1000 / mean };
  }, [state.intervals]);

  return (
    <ToolPage
      title="GPS Speedometer"
      note="Speed comes from the browser's Geolocation API. Phones report a Doppler-derived speed from the GNSS chip; laptops usually have no speed at all, so it is calculated from successive positions and will be noisy."
      noteLabel="How it works"
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_26rem]">
        <Card>
          <CardContent className="grid justify-items-center gap-5 p-6">
            <Gauge
              alert={status.alert}
              max={scale}
              status={status.text}
              unit={u.label}
              value={state.fix && !stale ? speed : 0}
            />

            <div className="flex w-full max-w-[26rem] flex-wrap items-center justify-center gap-2">
              {unitOrder.map((key) => (
                <Button
                  key={key}
                  size="sm"
                  variant={key === unit ? "default" : "outline"}
                  onClick={() => setUnit(key)}
                >
                  {units[key].label}
                </Button>
              ))}
            </div>

            <div className="flex w-full max-w-[26rem] flex-wrap items-center justify-center gap-2">
              <Button onClick={state.watching ? stop : start} disabled={!state.supported}>
                {state.watching ? "Stop tracking" : "Start tracking"}
              </Button>
              <Button variant="outline" onClick={resetTrip}>
                Reset trip
              </Button>
            </div>

            <div className="w-full max-w-[26rem]">
              <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <span>Speed trace · {state.history.length}</span>
                <span className="font-mono">peak {maxSpeed.toFixed(1)} {u.label}</span>
              </div>
              <Sparkline max={scale} values={state.history.map((v) => v * u.factor)} />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 content-start gap-3">
          <ResultTile accent label="Speed" unit={u.label} value={state.fix && !stale ? speed.toFixed(1) : "—"} />
          <ResultTile label="Max" unit={u.label} value={state.maxSpeed > 0 ? maxSpeed.toFixed(1) : "—"} />
          <ResultTile label="Avg moving" unit={u.label} value={avgMoving > 0 ? avgMoving.toFixed(1) : "—"} />
          <ResultTile
            label="Trip distance"
            unit={u.distanceLabel}
            value={(state.distance * u.distanceFactor).toFixed(2)}
          />
          <ResultTile label="Heading" unit={state.heading === null ? undefined : cardinal(state.heading)} value={state.heading === null ? "—" : `${state.heading.toFixed(0)}°`} />
          <ResultTile
            label="Altitude"
            unit="m"
            value={state.fix?.altitude != null ? state.fix.altitude.toFixed(0) : "—"}
          />
          <ResultTile label="Moving time" value={duration(state.movingMs)} />
          <ResultTile label="Tracked" value={duration(state.trackedMs)} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Position</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-0">
            <Row label="Latitude" value={state.fix ? state.fix.lat.toFixed(6) : "—"} />
            <Row label="Longitude" value={state.fix ? state.fix.lon.toFixed(6) : "—"} />
            <Row
              label="Horizontal accuracy"
              value={state.fix ? `± ${state.fix.accuracy.toFixed(1)} m` : "—"}
            />
            <Row
              label="Altitude accuracy"
              value={state.fix?.altitudeAccuracy != null ? `± ${state.fix.altitudeAccuracy.toFixed(1)} m` : "not reported"}
            />
            <Row
              label="Altitude"
              value={
                state.fix?.altitude != null
                  ? `${state.fix.altitude.toFixed(1)} m / ${(state.fix.altitude * 3.28084).toFixed(0)} ft`
                  : "not reported"
              }
            />
            <Row
              label="Likely fix source"
              value={state.fix ? fixSource(state.fix.accuracy) : "—"}
            />
            <Row
              label="Map"
              value={
                state.fix ? (
                  <a
                    className="text-accent underline decoration-accent/40 decoration-1 underline-offset-4 hover:decoration-accent"
                    href={`https://www.openstreetmap.org/?mlat=${state.fix.lat}&mlon=${state.fix.lon}#map=17/${state.fix.lat}/${state.fix.lon}`}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    OpenStreetMap
                  </a>
                ) : (
                  "—"
                )
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-0">
            <Row
              label="Watch status"
              value={
                <Badge tone={state.watching ? (stale ? "warn" : "ok") : "idle"}>
                  {state.watching ? (stale ? "stale" : "watching") : "stopped"}
                  {state.watchId !== null ? ` · id ${state.watchId}` : ""}
                </Badge>
              }
            />
            <Row label="Permission" value={state.permission} />
            <Row
              label="API available"
              value={`${state.supported ? "yes" : "no"} · secure context ${state.secureContext ? "yes" : "no"}`}
            />
            <Row
              label="Last update"
              value={
                state.fix
                  ? `${clock(state.fix.receivedAt)} · ${((age ?? 0) / 1000).toFixed(1)} s ago`
                  : "no fix yet"
              }
            />
            <Row
              label="Provider timestamp"
              value={state.fix ? `${clock(state.fix.timestamp)} · ${skew(state.fix.receivedAt - state.fix.timestamp)} old on arrival` : "—"}
            />
            <Row label="Fixes received" value={String(state.fixCount)} />
            <Row
              label="Update cadence"
              value={cadence ? `${cadence.mean.toFixed(0)} ms avg · ${cadence.hz.toFixed(2)} Hz` : "—"}
            />
            <Row label="Speed source" value={speedSourceLabel(state)} />
            <Row
              label="Heading source"
              value={
                state.headingSource === "device"
                  ? "device compass / GNSS course"
                  : state.headingSource === "derived"
                    ? `computed from track (needs > ${movingThreshold} m/s)`
                    : "unavailable"
              }
            />
            <Row label="Screen wake lock" value={state.wakeLock} />
            <Row
              label="Last error"
              value={
                state.error ? (
                  <span className="text-destructive">
                    {state.error.name} · {state.error.message || "no detail"} at {clock(state.error.at)}
                  </span>
                ) : (
                  "none"
                )
              }
            />
          </CardContent>
        </Card>
      </div>

      {!state.secureContext ? (
        <p className="mt-5 rounded-md border border-destructive bg-card p-4 text-sm">
          This page is not in a secure context. Browsers only hand out geolocation over HTTPS or
          localhost, so tracking will fail here.
        </p>
      ) : null}
    </ToolPage>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/70 py-2.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-sm">{value}</span>
    </div>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: "ok" | "warn" | "idle" }) {
  const toneClass =
    tone === "ok"
      ? "border-primary bg-primary text-primary-foreground"
      : tone === "warn"
        ? "border-destructive bg-destructive text-destructive-foreground"
        : "border-border bg-secondary text-secondary-foreground";
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] ${toneClass}`}>
      {children}
    </span>
  );
}

function gaugeStatus(state: GeoState, stale: boolean): { text: string; alert: boolean } {
  if (state.watching && state.error && !state.fix) return { text: state.error.name, alert: true };
  if (stale) return { text: "SIGNAL STALE", alert: true };
  if (state.watching && !state.fix) return { text: "ACQUIRING…", alert: false };
  if (!state.fix) return { text: "NO FIX", alert: false };
  if (!state.watching) return { text: `PAUSED · ± ${state.fix.accuracy.toFixed(0)} m`, alert: false };
  return { text: `± ${state.fix.accuracy.toFixed(0)} m`, alert: false };
}

function speedSourceLabel(state: GeoState) {
  if (state.speedSource === "device") return "GNSS Doppler (coords.speed)";
  if (state.speedSource === "derived") return "derived from position deltas";
  return "none yet";
}

/** Rough read on which radio produced the fix, based on reported accuracy. */
function fixSource(accuracy: number) {
  if (accuracy <= 10) return `GNSS (±${accuracy.toFixed(0)} m)`;
  if (accuracy <= 50) return `GNSS, weak or assisted (±${accuracy.toFixed(0)} m)`;
  if (accuracy <= 500) return `Wi-Fi positioning (±${accuracy.toFixed(0)} m)`;
  return `cell or IP geolocation (±${accuracy.toFixed(0)} m)`;
}

function cardinal(deg: number) {
  const names = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return names[Math.round(deg / 22.5) % 16];
}

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour12: false }) + `.${String(ms % 1000).padStart(3, "0")}`;
}

function skew(ms: number) {
  return ms < 1000 ? `${ms.toFixed(0)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function duration(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v: number) => String(v).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
