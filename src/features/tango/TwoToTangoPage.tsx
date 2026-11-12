import { useEffect, useRef, useState, type ReactNode } from "react";
import { ToolPage } from "@/components/tool-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  BOARD_ID_ADDR,
  checkElrs,
  CROSSFIRE_BUILDS,
  CROSSFIRE_LABEL,
  crossfireFromCatalog,
  familyName,
  type Crossfire,
  EDGETX_ADDR,
  EDGETX_MAX,
  ELRS_ADDR,
  hex,
  padFF,
  sha256Hex,
  SLOT_ADDR,
  SLOT_SIZE,
  uidFromPhrase,
  withUid,
} from "./images";
import { EDGETX_FILTER, edgetxToLoader, Loader, LOADER_FILTER, serialSupported } from "./loader";
import { checkAppImage, flashViaBootloader, hidSupported, requestBootloader } from "./tbs-bootloader";

const BASE = "/firmware/tango2/";

type ImageEntry = { file: string; size: number; sha256: string; version?: string };
type Manifest = { built: string; images: Record<"loader" | "edgetx" | "elrs", ImageEntry> };
type Images = { manifest: Manifest; loader: Uint8Array; edgetx: Uint8Array; elrs: Uint8Array };
type Status = { kind: "idle" | "busy" | "done" | "error"; text?: string };

async function loadImages(): Promise<Images> {
  const manifest: Manifest = await fetch(BASE + "manifest.json", { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(`manifest: HTTP ${r.status}`);
    return r.json();
  });
  const get = async (e: ImageEntry) => {
    const r = await fetch(BASE + e.file, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${e.file}: HTTP ${r.status}`);
    const d = new Uint8Array(await r.arrayBuffer());
    if (d.length !== e.size || (await sha256Hex(d)) !== e.sha256) throw new Error(`${e.file} failed its checksum`);
    return d;
  };
  const [loader, edgetx, elrs] = await Promise.all([
    get(manifest.images.loader),
    get(manifest.images.edgetx),
    get(manifest.images.elrs),
  ]);
  checkAppImage(loader);
  checkElrs(elrs);
  return { manifest, loader, edgetx, elrs };
}

export function TwoToTangoPage() {
  const [images, setImages] = useState<Images | null>(null);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [crossfires, setCrossfires] = useState<Crossfire[]>([]);
  const [crossfireStatus, setCrossfireStatus] = useState<Status>({ kind: "idle" });
  const [skipCrossfire, setSkipCrossfire] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [step1, setStep1] = useState<Status>({ kind: "idle" });
  const [step2, setStep2] = useState<Status>({ kind: "idle" });
  const [progress, setProgress] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLPreElement>(null);
  const busy = step1.kind === "busy" || step2.kind === "busy";

  useEffect(() => {
    loadImages().then(setImages, (e: Error) => setImagesError(e.message));
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const say = (line: string) => setLog((prev) => [...prev, line]);

  async function takeCrossfire(file: Uint8Array) {
    try {
      const cf = await crossfireFromCatalog(file);
      setCrossfires([cf]);
      setCrossfireStatus({ kind: "done", text: `${cf.build.file} verified. It is checked against the radio's board in step 4.` });
    } catch (e) {
      setCrossfires([]);
      setCrossfireStatus({ kind: "error", text: (e as Error).message });
    }
  }

  async function fetchCrossfire() {
    setCrossfireStatus({ kind: "busy", text: "Downloading from TBS…" });
    try {
      const got = await Promise.all(
        CROSSFIRE_BUILDS.map(async (b) => {
          const r = await fetch(b.url);
          if (!r.ok) throw new Error(`TBS's server answered HTTP ${r.status} for ${b.file}`);
          return crossfireFromCatalog(new Uint8Array(await r.arrayBuffer()));
        }),
      );
      setCrossfires(got);
      setCrossfireStatus({ kind: "done", text: "Both builds downloaded and verified. Step 4 uses the one that matches the radio." });
    } catch (e) {
      setCrossfires([]);
      setCrossfireStatus({
        kind: "error",
        text: `Couldn't fetch from TBS (${(e as Error).message}). Download the file for your radio with the links and choose it instead.`,
      });
    }
  }

  const trimmed = phrase.trim();
  const uid = trimmed ? uidFromPhrase(trimmed) : null;
  const haveCrossfire = crossfires.length > 0 || skipCrossfire;

  async function runStep1() {
    if (!images) return;
    setStep1({ kind: "busy", text: "Pick the radio (TBS BOOTLOADER or TBS TANGO II) in the browser's list" });
    setLog([]);
    setProgress(0);
    try {
      const dev = await requestBootloader();
      if (!dev) {
        setStep1({ kind: "idle" });
        setProgress(null);
        return;
      }
      setStep1({ kind: "busy", text: "Installing the loader…" });
      // Padded one block into 0x08020000, so a bootloader that erases what it
      // writes also clears whatever app was there and the loader stays put.
      const image = padFF(images.loader, 0x14000 + 6144);
      await flashViaBootloader(dev, image, { log: say, progress: setProgress });
      setStep1({ kind: "done", text: "Loader installed. The radio restarts into it on its own; go on to step 4." });
    } catch (e) {
      setStep1({ kind: "error", text: (e as Error).message });
    } finally {
      setProgress(null);
    }
  }

  async function runStep2() {
    if (!images || !haveCrossfire) return;
    setStep2({ kind: "busy", text: "Pick the radio's serial port" });
    setLog([]);
    let port: SerialPort;
    try {
      port = await navigator.serial.requestPort({ filters: [LOADER_FILTER, EDGETX_FILTER] });
    } catch {
      setStep2({ kind: "idle" });
      return;
    }
    try {
      if (port.getInfo().usbProductId === EDGETX_FILTER.usbProductId) {
        say("EdgeTX is running: asking it to restart into the loader");
        await edgetxToLoader(port);
        setStep2({
          kind: "idle",
          text: "The radio is restarting into its loader. Press Install again and pick the new port (STM32 Virtual ComPort).",
        });
        return;
      }

      const elrs = withUid(images.elrs, uid);
      const edgetx = padFF(images.edgetx, 4);
      if (edgetx.length > EDGETX_MAX) throw new Error("EdgeTX image too large");

      setStep2({ kind: "busy", text: "Reading the radio…" });
      const loader = await Loader.open(port, say);
      let cf: Uint8Array | null = null;
      try {
        if (!skipCrossfire) {
          const board = (await loader.peek(BOARD_ID_ADDR)) >>> 8;
          const build = CROSSFIRE_BUILDS.find((b) => b.family === board);
          if (!build) {
            throw new Error(
              `The bootloader doesn't list a known Crossfire board (read 0x${board.toString(16)}xx). ` +
                "Choose ExpressLRS only, or report this radio.",
            );
          }
          say(`Crossfire board ${familyName(board)}: using ${build.file}`);
          const match = crossfires.find((c) => c.build.family === board);
          if (!match) {
            throw new Error(
              `This radio has the ${familyName(board)} Crossfire board, so it needs ${build.file}. ` +
                "Fetch from TBS, or choose that file, and press Install again.",
            );
          }
          cf = padFF(match.image, 4);
        }
      } catch (e) {
        await loader.close().catch(() => {});
        throw e;
      }
      const total = edgetx.length + elrs.length + (cf?.length ?? 0);
      let base = 0;
      const progress = (n: number) => setProgress((base + n) / total);

      setStep2({ kind: "busy", text: "Writing…" });
      setProgress(0);
      try {
        say("Erasing EdgeTX and the radio images");
        await loader.erase(EDGETX_ADDR, edgetx.length, say);
        await loader.erase(SLOT_ADDR, SLOT_SIZE, say);
        if (cf) {
          say(`Writing Crossfire (${cf.length} B)`);
          await loader.write(SLOT_ADDR, cf, progress);
          base += cf.length;
        }
        say(`Writing ExpressLRS ${images.manifest.images.elrs.version ?? ""} (${elrs.length} B)${uid ? `, UID ${hex(uid)}` : ", no bind phrase"}`);
        await loader.write(ELRS_ADDR, elrs, progress);
        base += elrs.length;
        // EdgeTX's vector table goes last: until it lands, the loader won't boot
        // a half-written EdgeTX, so an interrupted install just stays in the loader.
        say(`Writing EdgeTX (${edgetx.length} B)`);
        await loader.write(EDGETX_ADDR + 8, edgetx.subarray(8), progress);
        await loader.write(EDGETX_ADDR, edgetx.subarray(0, 8));
        setProgress(1);
        say("All written and CRC-checked; starting EdgeTX");
        await loader.boot();
      } catch (e) {
        await loader.close().catch(() => {});
        throw e;
      }
      setStep2({ kind: "done", text: "Done. EdgeTX is starting." });
    } catch (e) {
      setStep2({ kind: "error", text: (e as Error).message });
    } finally {
      setProgress(null);
    }
  }

  const unsupported = !hidSupported() || !serialSupported();

  return (
    <ToolPage
      title="Two to Tango"
      noteLabel="What this is"
      note="EdgeTX for the TBS Tango 2 with both Crossfire and ExpressLRS resident in flash. Pick the link per model in Model Setup and the radio swaps between them on the fly."
    >
      <div className="grid gap-5 [&>*]:min-w-0">
        {unsupported ? (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">
              This browser can't talk to the radio. Use desktop Chrome, Edge or Opera (they have WebHID and Web Serial).
            </CardContent>
          </Card>
        ) : null}
        {imagesError ? (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">Firmware files failed to load: {imagesError}</CardContent>
          </Card>
        ) : null}

        <StepCard
          n={1}
          title={`Get ${CROSSFIRE_LABEL} from TBS`}
          description={
            <>
              This page doesn't host any TBS code; the Crossfire half comes straight from TBS's firmware server. Tango
              2s have one of two Crossfire radio boards, and TBS publishes a build for each:{" "}
              {CROSSFIRE_BUILDS.map((b, i) => (
                <span key={b.file}>
                  {i ? " and " : ""}
                  <a className="font-mono text-accent underline underline-offset-4" href={b.url}>
                    {b.file}
                  </a>{" "}
                  ({b.tbsName})
                </span>
              ))}
              . The wrong one transmits nothing, so step 4 reads which board your radio has and uses the matching file.
              Fetching gets both; if you download one yourself, the installer tells you if it's the wrong one.
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={fetchCrossfire} disabled={busy || crossfireStatus.kind === "busy" || skipCrossfire}>
              Fetch it from TBS
            </Button>
            <label
              className={cn(
                "inline-flex h-10 cursor-pointer items-center rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-secondary",
                (busy || skipCrossfire) && "pointer-events-none opacity-50",
              )}
            >
              Choose the downloaded file
              <input
                type="file"
                accept=".bin"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) await takeCrossfire(new Uint8Array(await f.arrayBuffer()));
                  e.target.value = "";
                }}
              />
            </label>
            <div className="flex items-center gap-3 rounded-md border bg-secondary/35 px-3 py-2">
              <Label htmlFor="skip-xf">ExpressLRS only</Label>
              <Switch id="skip-xf" checked={skipCrossfire} onCheckedChange={setSkipCrossfire} disabled={busy} />
            </div>
          </div>
          {skipCrossfire ? (
            <p className="text-sm text-muted-foreground">
              No Crossfire: the internal module only runs ExpressLRS, and any Crossfire image already on the radio is
              erased.
            </p>
          ) : (
            <StatusLine status={crossfireStatus} />
          )}
        </StepCard>

        <StepCard
          n={2}
          title="ExpressLRS bind phrase"
          description="Optional. Sets the bind phrase in the ExpressLRS image, the same way the ExpressLRS Configurator does. Leave it empty to bind from the ELRS Lua script instead."
        >
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="phrase">Bind phrase</Label>
            <Input
              id="phrase"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="none"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
            <p className="font-mono text-xs text-muted-foreground">{uid ? `UID ${[...uid].join(",")}` : "unbound"}</p>
          </div>
        </StepCard>

        <StepCard
          n={3}
          title="Install the loader (first time only)"
          description="A small resident loader goes where the stock firmware starts; it boots EdgeTX and installs everything else in step 4. Skip this if the radio already runs Two to Tango."
        >
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Turn the radio fully off: unplug USB, and take the battery out or disconnect it.</li>
            <li>
              Hold the E button (on the back, right side, under your middle finger) and plug in USB. Keep holding
              until the computer plays its USB connect sound: it can take almost 10 seconds. Then let go.
            </li>
            <li>Press Install and pick the radio: it may be listed as “TBS BOOTLOADER” or “TBS TANGO II”. It takes about a minute.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <Button size="lg" onClick={runStep1} disabled={busy || !images || unsupported}>
              {step1.kind === "busy" ? "Installing…" : "Install loader"}
            </Button>
            {step1.kind === "busy" && progress !== null ? <Progress value={progress} /> : null}
          </div>
          <StatusLine status={step1} />
        </StepCard>

        <StepCard
          n={4}
          title="Install EdgeTX, ExpressLRS and Crossfire"
          description="Over USB serial, about a minute. Works from the loader (after step 3) or from a radio already running Two to Tango: then it restarts into the loader first and you press Install once more."
        >
          <div className="flex flex-wrap items-center gap-4">
            <Button size="lg" onClick={runStep2} disabled={busy || !images || unsupported || !haveCrossfire}>
              {step2.kind === "busy" ? "Installing…" : "Install"}
            </Button>
            {step2.kind === "busy" && progress !== null ? <Progress value={progress} /> : null}
            {!haveCrossfire ? (
              <span className="text-sm text-muted-foreground">Get the Crossfire file first, or choose ExpressLRS only.</span>
            ) : null}
          </div>
          <StatusLine status={step2} />
        </StepCard>

        <Card>
          <CardHeader>
            <CardTitle>Switching links</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">
            In <b>Model Setup → Internal RF</b>, the Mode line shows <span className="font-mono">CRSF</span> and a second
            field, <span className="font-mono">ELRS</span> or <span className="font-mono">XFire</span>. Change it and the
            radio stops one link and starts the other within a second. It's saved per model, so changing models changes
            the link too.
          </CardContent>
        </Card>

        {images ? (
          <p className="text-xs text-muted-foreground">
            Build {images.manifest.built}: loader {(images.loader.length / 1024).toFixed(0)} KB, EdgeTX{" "}
            {(images.edgetx.length / 1024).toFixed(0)} KB, ExpressLRS {images.manifest.images.elrs.version}.
          </p>
        ) : null}

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

function StepCard({
  n,
  title,
  description,
  children,
}: {
  n: number;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Step {n}</p>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (!status.text) return null;
  return (
    <p
      className={cn(
        "text-sm",
        status.kind === "error" && "text-destructive",
        status.kind === "done" && "text-foreground",
        (status.kind === "busy" || status.kind === "idle") && "text-muted-foreground",
      )}
    >
      {status.text}
    </p>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="flex min-w-48 flex-1 items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground">{Math.round(value * 100)}%</span>
    </div>
  );
}
