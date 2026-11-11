import { useEffect, useMemo, useRef, useState } from "react";
import type { Before } from "esptool-js";
import { ToolPage } from "@/components/tool-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { identifyDevice, serialSupported, type DeviceReport, type ImageSlot } from "./device";
import { describeRadio, loadTargets, matchTargets, POWER_LEVEL_MW, type TargetsDb } from "./match";

const SECRET_KEYS = ["wifi-password"];

const hex = (n: number, width = 6) => `0x${n.toString(16).padStart(width, "0")}`;

export function ElrsIdentifyPage() {
  const [db, setDb] = useState<TargetsDb | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [baud, setBaud] = useState(460800);
  const [before, setBefore] = useState<Before>("default_reset");
  const [allSlots, setAllSlots] = useState(false);
  const [scan, setScan] = useState(true);
  const [resetAfter, setResetAfter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DeviceReport | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [bytes, setBytes] = useState(0);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    loadTargets().then(setDb, (e: Error) => setDbError(e.message));
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  async function connect() {
    setBusy(true);
    setError(null);
    setReport(null);
    setLog([]);
    setBytes(0);
    try {
      const result = await identifyDevice({
        baud,
        before,
        allSlots,
        scanOverrides: scan,
        resetAfter,
        log: (line) => setLog((prev) => [...prev, line.trimEnd()]),
        progress: setBytes,
      });
      setReport(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!/No port selected/i.test(message)) setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolPage
      title="ELRS Target Identifier"
      noteLabel="How it works"
      note="Reads the configuration block ExpressLRS appends after the firmware image — product name, options, and pin layout — then matches the pin map against targets.json. Reads 30–200 KB of flash and writes nothing."
    >
      <div className="grid gap-5 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Connect</CardTitle>
            <CardDescription>
              Put the receiver or TX module in its ESP bootloader (hold BOOT while powering it, or plug in a USB
              board with auto-reset), then pick its serial port. Needs Chrome or Edge on desktop.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="grid gap-2">
                <Label htmlFor="baud">Baud rate</Label>
                <Select id="baud" value={baud} onChange={(e) => setBaud(Number(e.target.value))} disabled={busy}>
                  {[115200, 230400, 460800, 921600].map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="before">Reset before</Label>
                <Select id="before" value={before} onChange={(e) => setBefore(e.target.value as Before)} disabled={busy}>
                  <option value="default_reset">Auto-reset (DTR/RTS)</option>
                  <option value="no_reset">Already in bootloader</option>
                  <option value="usb_reset">USB-JTAG (C3/S3 native USB)</option>
                </Select>
              </div>
              <Toggle label="Scan LittleFS overrides" checked={scan} onChange={setScan} disabled={busy} />
              <Toggle label="Show all app slots" checked={allSlots} onChange={setAllSlots} disabled={busy} />
              <Toggle label="Reboot when done" checked={resetAfter} onChange={setResetAfter} disabled={busy} />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button size="lg" onClick={connect} disabled={busy || !serialSupported()}>
                {busy ? "Reading…" : "Connect & identify"}
              </Button>
              {busy && bytes > 0 ? (
                <span className="font-mono text-sm text-muted-foreground">{(bytes / 1024).toFixed(0)} KB read</span>
              ) : null}
              {!serialSupported() ? (
                <span className="text-sm text-destructive">
                  This browser has no Web Serial. Use desktop Chrome, Edge, or Opera.
                </span>
              ) : null}
              {dbError ? <span className="text-sm text-destructive">Targets list failed to load: {dbError}</span> : null}
              {db ? (
                <span className="text-xs text-muted-foreground">
                  {db.targets.length} targets from ExpressLRS/targets@{db.ref}, {db.fetched.slice(0, 10)}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {error ? (
          <Card>
            <CardContent className="grid gap-2 p-6 text-sm">
              <p className="font-medium text-destructive">{error}</p>
              <p className="text-muted-foreground">
                Usually the device is not in its bootloader, or another program (a configurator, a serial monitor)
                has the port open. Try “Already in bootloader” for boards without auto-reset wiring, or a lower baud
                rate.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {report ? <Report report={report} db={db} /> : null}

        {log.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Log</CardTitle>
            </CardHeader>
            <CardContent>
              <pre
                ref={logRef}
                className="max-h-64 overflow-auto rounded-md border bg-secondary/40 p-3 font-mono text-xs leading-5"
              >
                {log.join("\n")}
              </pre>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </ToolPage>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 self-end rounded-md border bg-secondary/35 px-3 py-2.5">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function Report({ report, db }: { report: DeviceReport; db: TargetsDb | null }) {
  const { chip } = report;
  const presentOverrides = report.overrides
    ? Object.entries(report.overrides)
        .filter(([, found]) => found)
        .map(([name]) => name)
    : [];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Chip</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Family" value={chip.family} big />
            <Fact label="MAC address" value={chip.mac || "unavailable (secure download mode)"} big mono />
            <Fact label="Flash" value={[chip.flashSize, chip.flashVendor].filter(Boolean).join(" · ") || "unknown"} big />
            <Fact label="Flash read" value={`${(report.bytesRead / 1024).toFixed(0)} KB`} big mono />
            <Fact label="Description" value={chip.description} />
            <Fact label="Revision" value={chip.revision === null ? "—" : `v${Math.floor(chip.revision / 100)}.${chip.revision % 100}`} />
            <Fact label="Crystal" value={chip.crystalMhz ? `${chip.crystalMhz} MHz` : "—"} />
            <Fact label="Flash JEDEC ID" value={chip.flashId === null ? "—" : hex(chip.flashId)} mono />
            <Fact label="Features" value={chip.features.join(", ") || "—"} wide />
          </dl>
        </CardContent>
      </Card>

      {report.images.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm">No application partition found.</CardContent>
        </Card>
      ) : (
        report.images.map((img) => <ImageCard key={img.offset} img={img} db={db} family={chip.family} />)
      )}

      {report.overrides ? (
        <Card className={cn(presentOverrides.length && "border-accent/60")}>
          <CardHeader>
            <CardTitle>LittleFS overrides</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm leading-6">
            {presentOverrides.length === 0 ? (
              <p>None — the trailer above is what the firmware runs.</p>
            ) : (
              <>
                <p>
                  Present: <span className="font-mono">{presentOverrides.join(", ")}</span>
                </p>
                {presentOverrides.includes("hardware.json") ? (
                  <p className="text-muted-foreground">
                    hardware.json always wins over the trailer layout, so the running pin map may differ from what is
                    shown here.
                  </p>
                ) : null}
                {presentOverrides.includes("options.json") ? (
                  <p className="text-muted-foreground">
                    options.json wins while its flash-discriminator matches the trailer's (it was written from the
                    device's web UI).
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {report.partitions.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Partition table</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[28rem] font-mono text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-4 font-medium">Label</th>
                  <th className="py-1 pr-4 font-medium">Type</th>
                  <th className="py-1 pr-4 font-medium">Subtype</th>
                  <th className="py-1 pr-4 font-medium">Offset</th>
                  <th className="py-1 font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {report.partitions.map((p) => (
                  <tr key={p.offset} className="border-t">
                    <td className="py-1 pr-4">{p.label}</td>
                    <td className="py-1 pr-4">{p.type === 0 ? "app" : p.type === 1 ? "data" : p.type}</td>
                    <td className="py-1 pr-4">{hex(p.subtype, 2)}</td>
                    <td className="py-1 pr-4">{hex(p.offset)}</td>
                    <td className="py-1">{(p.size / 1024).toFixed(0)} KB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function ImageCard({ img, db, family }: { img: ImageSlot; db: TargetsDb | null; family: string }) {
  const [showSecrets, setShowSecrets] = useState(false);
  const [showLayout, setShowLayout] = useState(false);
  const t = img.trailer;
  const matches = useMemo(() => (db && t ? matchTargets(db, t, family) : []), [db, t, family]);
  const best = matches[0];
  const radio = useMemo(() => describeRadio(t?.layout ?? null, best), [t, best]);

  const title = `Partition ${img.label} @ ${hex(img.offset)}`;
  if (!t) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{img.active ? "Running image" : "Inactive slot"}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {img.empty
            ? "No firmware image in this slot."
            : "No configuration trailer — bare firmware that never went through the configurator (configured through its web UI instead), or an unused slot."}
        </CardContent>
      </Card>
    );
  }

  const options = t.options ?? {};
  const pinDiffs = best?.diff?.filter((d) => !d.tuning) ?? [];

  return (
    <Card className={cn(img.active && "border-primary/40")}>
      <CardHeader>
        <CardTitle>{t.productName || "(no product name)"}</CardTitle>
        <CardDescription>
          {title} · {img.active ? "running image" : "inactive slot"} · trailer at {hex(t.offset)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 [&>*]:min-w-0">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Device (lua) name" value={t.deviceName || "—"} big />
          <Fact label="Best target" value={best ? best.entry.target : db ? "no match" : "loading…"} big mono wide />
          <Fact label="PlatformIO env" value={best?.entry.firmware ?? "—"} mono />
        </dl>

        {best ? (
          <div
            className={cn(
              "rounded-md border p-4 text-sm leading-6",
              pinDiffs.length ? "border-destructive/50 bg-destructive/5" : "border-primary/30 bg-primary/5",
            )}
          >
            <p className="font-medium">{best.entry.product_name}</p>
            <p className="text-muted-foreground">
              {best.reasons.join(", ") || "name similarity only"} · layout file {best.entry.layout_file ?? "—"}
            </p>
            {pinDiffs.length ? (
              <p className="mt-2 text-destructive">
                {pinDiffs.length} pin difference{pinDiffs.length > 1 ? "s" : ""} from this target — the match is
                probably wrong. The pin map is the board.
              </p>
            ) : best.diff?.length ? (
              <p className="mt-2">
                Pins match exactly; only power tuning differs, which is normal for a device flashed from an older
                release.
              </p>
            ) : null}
          </div>
        ) : null}

        {radio ? (
          <section className="grid gap-3">
            <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Radio & power</h3>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              <Fact
                label="Radios"
                value={`${radio.count} × ${radio.chip ?? "unknown"}${
                  radio.count === 2 ? (radio.dualBand ? ", dual-band (Gemini)" : ", true diversity") : ""
                }`}
              />
              <Fact
                label="Power levels"
                value={
                  radio.powerMin !== undefined && radio.powerMax !== undefined
                    ? `${POWER_LEVEL_MW[radio.powerMin] ?? "?"} – ${POWER_LEVEL_MW[radio.powerMax] ?? "?"}`
                    : "—"
                }
              />
              <Fact
                label="Default power"
                value={radio.powerDefault !== undefined ? (POWER_LEVEL_MW[radio.powerDefault] ?? "?") : "—"}
              />
              <Fact
                label="Power control"
                value={
                  radio.powerControl === 0
                    ? "Direct to radio"
                    : radio.powerControl === 3
                      ? "DAC on power_apc2"
                      : String(radio.powerControl ?? "—")
                }
              />
              {radio.powerValues !== undefined ? (
                <Fact
                  label={radio.dualBand ? "Values, low band" : "Values per step"}
                  value={JSON.stringify(radio.powerValues)}
                  mono
                />
              ) : null}
              {radio.powerValuesDual ? (
                <Fact label="Values, high band" value={JSON.stringify(radio.powerValuesDual)} mono />
              ) : null}
              {radio.powerValues2 ? <Fact label="Values, second" value={JSON.stringify(radio.powerValues2)} mono /> : null}
              {radio.lnaGain !== undefined ? <Fact label="LNA gain" value={`${radio.lnaGain} dB`} /> : null}
            </dl>
            <p className="text-xs leading-5 text-muted-foreground">
              Power values are calibration numbers handed to the radio (dBm on LR1121/SX128x), not measured output.
              {radio.powerHighUnused !== undefined
                ? ` power_high = ${JSON.stringify(radio.powerHighUnused)} is in the layout but the firmware ignores it.`
                : ""}
            </p>
          </section>
        ) : null}

        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Options</h3>
            {Object.keys(options).some((k) => SECRET_KEYS.includes(k)) ? (
              <div className="flex items-center gap-2">
                <Label className="text-xs">Show secrets</Label>
                <Switch checked={showSecrets} onCheckedChange={setShowSecrets} />
              </div>
            ) : null}
          </div>
          {t.options ? (
            <table className="w-full font-mono text-xs">
              <tbody>
                {Object.keys(options)
                  .sort()
                  .map((k) => (
                    <tr key={k} className="border-t">
                      <td className="w-40 py-1.5 pr-4 align-top text-muted-foreground sm:w-56">{k}</td>
                      <td className="break-all py-1.5">
                        {SECRET_KEYS.includes(k) && !showSecrets && options[k] ? "••••••••" : JSON.stringify(options[k])}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <p className="break-all font-mono text-xs">{t.optionsRaw || "(empty)"}</p>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            {"uid" in options
              ? "Bound with a binding phrase (uid)."
              : options["lock-on-first-connection"]
                ? "No uid: binds to the first TX it hears; the UID lives in NVS, not here."
                : "No uid in the trailer."}
          </p>
        </section>

        {matches.length > 1 ? (
          <section className="grid gap-3">
            <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Other candidates</h3>
            <table className="w-full font-mono text-xs">
              <tbody>
                {matches.slice(1).map((m) => (
                  <tr key={m.entry.target} className="border-t">
                    <td className="break-all py-1.5 pr-4">{m.entry.target}</td>
                    <td className="py-1.5 pr-4 text-right">{m.score}</td>
                    <td className="py-1.5 text-muted-foreground">{m.reasons.join(", ") || "name similarity only"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {best?.diff?.length ? (
          <section className="grid gap-3">
            <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Layout vs {best.entry.target}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] font-mono text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-4 font-medium">Key</th>
                    <th className="py-1 pr-4 font-medium">Device</th>
                    <th className="py-1 pr-4 font-medium">Target</th>
                    <th className="py-1 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {best.diff.map((d) => (
                    <tr key={d.key} className="border-t">
                      <td className="py-1.5 pr-4">{d.key}</td>
                      <td className="break-all py-1.5 pr-4">{JSON.stringify(d.device) ?? "—"}</td>
                      <td className="break-all py-1.5 pr-4">{JSON.stringify(d.target) ?? "—"}</td>
                      <td className={cn("py-1.5", d.tuning ? "text-muted-foreground" : "font-medium text-destructive")}>
                        {d.tuning ? "tuning" : "PIN"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {t.layout ? (
          <section className="grid gap-3">
            <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setShowLayout((v) => !v)}>
              {showLayout ? "Hide" : "Show"} full layout ({Object.keys(t.layout).length} keys)
            </Button>
            {showLayout ? (
              <pre className="max-h-96 overflow-auto rounded-md border bg-secondary/40 p-3 font-mono text-xs leading-5">
                {JSON.stringify(t.layout, null, 2)}
              </pre>
            ) : null}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Fact({
  label,
  value,
  big,
  mono,
  wide,
}: {
  label: string;
  value: string;
  big?: boolean;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <dt className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1.5 break-words", big ? "text-lg font-medium" : "text-sm", mono && "font-mono")}>{value}</dd>
    </div>
  );
}
