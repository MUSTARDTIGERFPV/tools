import { useEffect, useRef, useState, type ReactNode } from "react";
import { ToolPage } from "@/components/tool-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Hub, serialSupported } from "./hub";
import {
  conditionName,
  defaultChannel,
  NCH,
  parseMix,
  sixPosTable,
  sourceName,
  SRC_6POS,
  arduPilotSixPosChannel,
  buildMix,
  channelUs,
  type Channel,
} from "./model";
import {
  deviceInfo,
  factoryReset,
  parseStatus,
  readModel,
  rebootElrs,
  writeModel,
  type DeviceInfo,
  type ModelBlobs,
  type Status,
} from "./radio";

const AX12_PORT = { usbVendorId: 0x2e3c, usbProductId: 0x5750 };
const AX12_SYS_ID = 0x00230226;
const FLIGHT_MODE_CH = 11; // CH12, zero-based

type Model = ModelBlobs & { chans: Channel[] };
type Busy = { text: string; progress?: number } | null;
type Note = { kind: "ok" | "error"; text: string } | null;

function toModel(b: ModelBlobs): Model {
  if (b.cfg[0] !== 0xa3) throw new Error("The radio's model config isn't in a format this page knows.");
  return { ...b, chans: parseMix(b.mix) };
}

const hexOf = (b: Uint8Array) => Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("");
const bytesOf = (h: string) => new Uint8Array((h.match(/../g) ?? []).map((x) => parseInt(x, 16)));

export function Ax12Page() {
  const [hub, setHub] = useState<Hub | null>(null);
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [noStream, setNoStream] = useState(false);
  const [model, setModel] = useState<Model | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [note, setNote] = useState<Note>(null);
  const hubRef = useRef<Hub | null>(null);

  useEffect(() => () => void hubRef.current?.close(), []);

  useEffect(() => {
    if (!hub) return;
    setNoStream(false);
    const off = hub.listen((f) => {
      const s = parseStatus(f);
      if (s) setStatus(s);
    });
    const t = setTimeout(() => setNoStream(true), 2500);
    return () => {
      off();
      clearTimeout(t);
    };
  }, [hub]);

  async function run(text: string, fn: () => Promise<string | void>) {
    setBusy({ text });
    setNote(null);
    try {
      const done = await fn();
      if (done) setNote({ kind: "ok", text: done });
    } catch (e) {
      setNote({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function connect() {
    let port: SerialPort;
    try {
      port = await navigator.serial.requestPort({ filters: [AX12_PORT] });
    } catch {
      return;
    }
    await run("Connecting…", async () => {
      const h = await Hub.open(port);
      try {
        const i = await deviceInfo(h);
        if (i.sysId !== AX12_SYS_ID) throw new Error(`That device reports system ID 0x${i.sysId.toString(16)}, not an AX12.`);
        setInfo(i);
        setBusy({ text: "Reading the model…" });
        setModel(toModel(await readModel(h)));
      } catch (e) {
        await h.close();
        throw e;
      }
      h.onClose = () => {
        setHub(null);
        hubRef.current = null;
        setStatus(null);
        setNote({ kind: "error", text: "The radio disconnected." });
      };
      hubRef.current = h;
      setHub(h);
    });
  }

  async function disconnect() {
    const h = hubRef.current;
    hubRef.current = null;
    setHub(null);
    setStatus(null);
    if (h) {
      h.onClose = undefined;
      await h.close();
    }
  }

  const reload = () =>
    run("Reading the model…", async () => {
      setModel(toModel(await readModel(hub!)));
      return "Model read from the radio.";
    });

  function saveBackup() {
    if (!model || !info) return;
    const body = JSON.stringify(
      {
        format: "ax12-model",
        version: 1,
        saved: new Date().toISOString(),
        radio: { name: info.name, firmware: info.version, deviceId: info.devId.toString(16).padStart(8, "0") },
        cfg: hexOf(model.cfg),
        mix: hexOf(model.mix),
      },
      null,
      2,
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    a.download = `ax12-model-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function write(next: ModelBlobs, label: string) {
    await run(label, async () => {
      const back = await writeModel(hub!, next, (p) => setBusy({ text: label, progress: p }));
      setModel(toModel(back));
    });
  }

  async function restore(file: File) {
    let next: Model;
    try {
      const j = JSON.parse(await file.text());
      if (j.format !== "ax12-model") throw new Error();
      next = toModel({ cfg: bytesOf(j.cfg), mix: bytesOf(j.mix) });
    } catch (e) {
      setNote({ kind: "error", text: (e as Error).message || "That isn't an AX12 model backup from this page." });
      return;
    }
    if (!window.confirm("Replace the model on the radio with this backup?")) return;
    await write(next, "Restoring the backup…");
    setNote((n) => n ?? { kind: "ok", text: "Backup restored and read back from the radio." });
  }

  async function arduPilotPreset() {
    if (!model) return;
    let ch: Channel;
    try {
      ch = arduPilotSixPosChannel(model.cfg).channel;
    } catch (e) {
      setNote({ kind: "error", text: (e as Error).message });
      return;
    }
    const old = model.chans[FLIGHT_MODE_CH];
    const was = old?.lines.length ? old.lines.map((l) => sourceName(l.src)).join(" + ") : "nothing";
    if (!window.confirm(`Replace CH12 (currently ${was}) with the 6POS, spaced for ArduPilot flight modes?`)) return;
    const chans = model.chans.slice();
    while (chans.length <= FLIGHT_MODE_CH) chans.push(defaultChannel());
    chans[FLIGHT_MODE_CH] = ch;
    await write({ cfg: model.cfg, mix: buildMix(chans) }, "Writing CH12…");
    setNote((n) => n ?? { kind: "ok", text: "CH12 is now the 6POS. In ArduPilot set FLTMODE_CH = 12." });
  }

  async function doFactoryReset() {
    if (
      !window.confirm(
        "Factory reset puts the model config and every mix back to the radio's defaults. Save a backup first if you want this model again. Continue?",
      )
    )
      return;
    await run("Resetting…", async () => {
      await factoryReset(hub!);
      // the MCU saves the defaults a few seconds later; what it holds in RAM is already reset
      setModel(toModel(await readModel(hub!)));
      return "Model reset to defaults.";
    });
  }

  const connected = !!hub;
  const disabled = !connected || !!busy;
  const flightCh = model?.chans[FLIGHT_MODE_CH];

  return (
    <ToolPage
      title="AX12 Configurator"
      noteLabel="What this is"
      note="Plug a Radiomaster AX12 into USB-C to see its sticks, switches and channel outputs live, back up and restore its model, and set up a 6-position switch for ArduPilot."
    >
      <div className="grid gap-5 [&>*]:min-w-0">
        <Card className="border-accent/60">
          <CardContent className="p-6 text-sm leading-7">
            <b>Close the RadiomasterAX app first</b> (swipe it away), and open it again when you're done here. While it
            runs it talks to the same controller and can overwrite what this page writes.
          </CardContent>
        </Card>
        {!serialSupported() ? (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">
              This browser can't open serial ports. Use desktop Chrome, Edge or Opera.
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Radio</CardTitle>
            <CardDescription>
              The radio shows up as a USB serial device. If it isn't in the browser's list, try another cable; some only
              carry power.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {connected ? (
                <Button variant="outline" onClick={disconnect} disabled={!!busy}>
                  Disconnect
                </Button>
              ) : (
                <Button onClick={connect} disabled={!!busy || !serialSupported()}>
                  Connect
                </Button>
              )}
              {busy ? (
                <span className="flex min-w-48 flex-1 items-center gap-3 text-sm text-muted-foreground">
                  {busy.text}
                  {busy.progress !== undefined ? <Bar value={busy.progress} /> : null}
                </span>
              ) : null}
            </div>
            {note ? (
              <p className={cn("text-sm", note.kind === "error" ? "text-destructive" : "text-foreground")}>{note.text}</p>
            ) : null}
            {info ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <Fact label="Controller" value={info.name || "—"} />
                <Fact label="Firmware" value={info.version} mono />
                <Fact label="Device ID" value={info.devId.toString(16).toUpperCase().padStart(8, "0")} mono />
                <Fact label="Battery" value={status ? `${status.batteryVolts.toFixed(2)} V` : "—"} mono />
              </dl>
            ) : null}
            {connected && status && status.batteryVolts < 3.5 ? (
              <p className="text-sm text-destructive">
                The battery is nearly flat. Below about 3.4 V the controller stops answering; charge it before writing.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {connected ? (
          <Card>
            <CardHeader>
              <CardTitle>Sticks and switches</CardTitle>
              <CardDescription>Live from the radio, about 25 times a second.</CardDescription>
            </CardHeader>
            <CardContent>
              {status ? (
                <LiveInputs status={status} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {noStream ? "The radio isn't sending its live inputs over USB." : "Waiting for the radio…"}
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {connected && model ? (
          <Card>
            <CardHeader>
              <CardTitle>Channels</CardTitle>
              <CardDescription>
                What the radio sends to ExpressLRS, worked out here from its model and the live inputs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChannelBars model={model} status={status} />
            </CardContent>
          </Card>
        ) : null}

        {connected && model ? (
          <Card>
            <CardHeader>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">ArduPilot</p>
              <CardTitle>6POS flight modes on CH12</CardTitle>
              <CardDescription>
                Maps the six buttons to ArduPilot's six flight-mode bands on CH12 and checks every button lands in its
                own band under each ExpressLRS switch mode. CH12 is the 16-position channel in Hybrid, so it's the one
                that can carry all six. Afterwards set <code className="font-mono">FLTMODE_CH = 12</code> on the flight
                controller.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div>
                <Button onClick={arduPilotPreset} disabled={disabled}>
                  Set up CH12 for ArduPilot
                </Button>
              </div>
              {flightCh ? <SixPosCheck model={model} ch={flightCh} /> : null}
            </CardContent>
          </Card>
        ) : null}

        {connected && model ? (
          <Card>
            <CardHeader>
              <CardTitle>Model</CardTitle>
              <CardDescription>
                The model the radio is using: its settings and every channel's mix. A backup is a small file you can
                restore later, to this radio or another AX12.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={reload} disabled={disabled}>
                  Read again
                </Button>
                <Button variant="outline" onClick={saveBackup} disabled={disabled}>
                  Save backup
                </Button>
                <label
                  className={cn(
                    "inline-flex h-10 cursor-pointer items-center rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-secondary",
                    disabled && "pointer-events-none opacity-50",
                  )}
                >
                  Restore backup
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) await restore(file);
                    }}
                  />
                </label>
              </div>
              <MixTable chans={model.chans} />
            </CardContent>
          </Card>
        ) : null}

        {connected ? (
          <Card>
            <CardHeader>
              <CardTitle>Radio actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <Action
                button={
                  <Button variant="outline" onClick={() => run("Rebooting ELRS…", async () => (await rebootElrs(hub!), "ELRS module restarting."))} disabled={disabled}>
                    Reboot ELRS
                  </Button>
                }
              >
                Power-cycles the internal ExpressLRS module. The radio beeps once.
              </Action>
              <Action
                button={
                  <Button variant="outline" className="text-destructive" onClick={doFactoryReset} disabled={disabled}>
                    Factory reset
                  </Button>
                }
              >
                Puts the model config and every mix back to defaults: sticks on CH1–4, SA–SF on CH5–10, P1 and P2 on
                CH11–12, the 6POS on CH13. Doesn't touch ExpressLRS or its binding. This is what Radiomaster's "AX12
                Repair" page does.
              </Action>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </ToolPage>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

function Action({ button, children }: { button: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[10rem_1fr] sm:items-center">
      <div>{button}</div>
      <p className="leading-6 text-muted-foreground">{children}</p>
    </div>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <span className="flex flex-1 items-center gap-3">
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
        <span className="block h-full bg-accent transition-[width]" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="font-mono text-xs">{Math.round(value * 100)}%</span>
    </span>
  );
}

// ---- live inputs ----

const pct = (v: number | null | undefined) => (v === null || v === undefined ? 0 : Math.max(-1, Math.min(1, v / 500)));

function Gimbal({ label, x, y }: { label: string; x: number; y: number }) {
  return (
    <figure className="grid justify-items-center gap-2">
      <svg viewBox="-110 -110 220 220" className="h-36 w-36 sm:h-40 sm:w-40" role="img" aria-label={label}>
        <rect x={-100} y={-100} width={200} height={200} rx={14} className="fill-secondary stroke-border" strokeWidth={2} />
        <line x1={-100} y1={0} x2={100} y2={0} className="stroke-border" strokeWidth={1.5} />
        <line x1={0} y1={-100} x2={0} y2={100} className="stroke-border" strokeWidth={1.5} />
        <circle cx={x * 88} cy={-y * 88} r={11} className="fill-primary" />
      </svg>
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

function HBar({ label, v, sub }: { label: string; v: number; sub?: string }) {
  // v in -1..1, drawn from the centre
  const left = v < 0 ? 50 + v * 50 : 50;
  return (
    <div className="grid grid-cols-[3.5rem_1fr_4.5rem] items-center gap-3 text-xs">
      <span className="font-medium">{label}</span>
      <span className="relative h-2.5 overflow-hidden rounded-full bg-secondary">
        <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <span className="absolute inset-y-0 bg-primary" style={{ left: `${left}%`, width: `${Math.abs(v) * 50}%` }} />
      </span>
      <span className="text-right font-mono text-muted-foreground">{sub}</span>
    </div>
  );
}

function SwitchPos({ name, v }: { name: string; v: number }) {
  const pos = v < -250 ? 0 : v > 250 ? 2 : 1;
  return (
    <div className="grid justify-items-center gap-1.5">
      <div className="grid h-14 w-7 grid-rows-3 gap-0.5 rounded-md border bg-secondary p-0.5">
        {[2, 1, 0].map((p) => (
          <span key={p} className={cn("rounded-sm", p === pos ? "bg-primary" : "bg-transparent")} />
        ))}
      </div>
      <span className="text-xs font-medium">{name}</span>
    </div>
  );
}

function LiveInputs({ status }: { status: Status }) {
  const s = status.sources;
  const present = (i: number) => s[i] !== null && s[i] !== undefined;
  const analog = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].filter(present);
  const switches = Array.from({ length: 15 }, (_, k) => 20 + k).filter(present);
  return (
    <div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
      <div className="flex flex-wrap justify-center gap-6">
        <Gimbal label="Rudder · Throttle" x={pct(s[0])} y={pct(s[2])} />
        <Gimbal label="Aileron · Elevator" x={pct(s[3])} y={pct(s[1])} />
      </div>
      <div className="grid gap-5">
        <div className="grid gap-2">
          {analog.map((i) => (
            <HBar key={i} label={sourceName(i)} v={pct(s[i])} sub={String(s[i])} />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <HBar key={i} label={`Trim ${i + 1}`} v={(status.trims[i] ?? 0) / 100} sub={String(status.trims[i] ?? 0)} />
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {switches.map((i) => (
            <SwitchPos key={i} name={sourceName(i)} v={s[i] ?? 0} />
          ))}
          {present(SRC_6POS) ? (
            <div className="grid gap-1.5">
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4, 5].map((b) => (
                  <span
                    key={b}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-md border font-mono text-xs",
                      status.sixPosMask & (1 << b) ? "border-primary bg-primary text-primary-foreground" : "bg-secondary",
                    )}
                  >
                    {b + 1}
                  </span>
                ))}
              </div>
              <span className="text-xs font-medium">6POS</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---- channels ----

function channelSummary(c: Channel | undefined) {
  if (!c || !c.lines.length) return "—";
  return c.lines.map((l) => `${sourceName(l.src)}${l.weight !== 100 ? ` ${l.weight}%` : ""}`).join(" + ");
}

function ChannelBars({ model, status }: { model: Model; status: Status | null }) {
  const inputs = status ?? { sources: Array(36).fill(0), trims: [0, 0, 0, 0] };
  return (
    <div className="grid gap-2">
      {Array.from({ length: NCH }, (_, i) => {
        const c = model.chans[i];
        const us = c ? channelUs(model.cfg, c, inputs) : 1500;
        return (
          <div key={i} className="grid grid-cols-[3rem_minmax(0,9rem)_1fr_3.5rem] items-center gap-3 text-xs">
            <span className="font-medium">CH{i + 1}</span>
            <span className="truncate text-muted-foreground">{channelSummary(c)}</span>
            <span className="relative h-2.5 overflow-hidden rounded-full bg-secondary">
              <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
              <span
                className="absolute inset-y-0 bg-primary"
                style={{
                  left: `${us < 1500 ? 50 - ((1500 - us) / 500) * 50 : 50}%`,
                  width: `${(Math.min(500, Math.abs(us - 1500)) / 500) * 50}%`,
                }}
              />
            </span>
            <span className="text-right font-mono">{us}</span>
          </div>
        );
      })}
    </div>
  );
}

function SixPosCheck({ model, ch }: { model: Model; ch: Channel }) {
  if (!ch.lines.some((l) => l.src === SRC_6POS)) {
    return <p className="text-sm text-muted-foreground">CH12 is {channelSummary(ch)} now, not the 6POS.</p>;
  }
  const rows = sixPosTable(model.cfg, ch);
  const ok = rows.every((r) => r.seen.every((s) => s.mode === r.position));
  return (
    <div className="grid gap-3">
      <p className={cn("text-sm", ok ? "text-foreground" : "text-destructive")}>
        {ok
          ? "CH12 is the 6POS, and each button gives its own flight mode in every switch mode."
          : "CH12 is the 6POS, but some buttons land in the wrong flight mode (red below)."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-2 pr-4 font-medium">Button</th>
              <th className="py-2 pr-4 font-medium">Radio out</th>
              {rows[0].seen.map((s) => (
                <th key={s.path} className="py-2 pr-4 font-medium">
                  {s.path}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r) => (
              <tr key={r.position} className="border-t">
                <td className="py-2 pr-4 font-sans font-medium">{r.position}</td>
                <td className="py-2 pr-4">{r.us} µs</td>
                {r.seen.map((s) => (
                  <td key={s.path} className={cn("py-2 pr-4", s.mode !== r.position && "text-destructive")}>
                    {s.us} µs · mode {s.mode || "–"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        µs is what ArduPilot reads on CH12; "mode" is the flight mode slot (FLTMODE1–6) it picks.
      </p>
    </div>
  );
}

function MixTable({ chans }: { chans: Channel[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-2 pr-4 font-medium">Channel</th>
            <th className="py-2 pr-4 font-medium">Mix</th>
            <th className="py-2 pr-4 font-medium">Weight</th>
            <th className="py-2 pr-4 font-medium">Limits</th>
          </tr>
        </thead>
        <tbody>
          {chans.map((c, i) => (
            <tr key={i} className="border-t align-top">
              <td className="py-2 pr-4 font-medium">CH{i + 1}</td>
              <td className="py-2 pr-4">
                {c.lines.length
                  ? c.lines.map((l, k) => (
                      <div key={k}>
                        {["=", "+", "×"][l.mode] ?? "?"} {sourceName(l.src)} {l.weight}%
                        {l.offset ? ` ${l.offset > 0 ? "+" : ""}${l.offset}` : ""}
                        {l.sw >> 6 !== 3 ? ` when ${conditionName(l.sw)}` : ""}
                        {l.curve !== 0xff ? ` curve ${l.curve + 1}` : ""}
                        {l.slow ? ` slow ${l.slow} ms` : ""}
                      </div>
                    ))
                  : "—"}
              </td>
              <td className="py-2 pr-4 font-mono">{c.weight}%</td>
              <td className="py-2 pr-4 font-mono">
                {c.min}…{c.max}
                {c.middle ? `, mid ${c.middle}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
