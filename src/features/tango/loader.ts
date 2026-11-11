/// <reference types="w3c-web-serial" />
// The Tango 2 resident loader at 0x0800C000: a line protocol over USB CDC
// (0483:5740) that erases and programs 0x08020000-0x080FFFFF. Every command
// ends with "OK" or "ERR <reason>". Our EdgeTX (0483:5741) reboots into it with
// the CLI command `loader`.
import { crc32 } from "./images";

export const LOADER_FILTER = { usbVendorId: 0x0483, usbProductId: 0x5740 };
export const EDGETX_FILTER = { usbVendorId: 0x0483, usbProductId: 0x5741 };
const SECTOR = 0x20000;

export const serialSupported = () => typeof navigator !== "undefined" && "serial" in navigator;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Lines {
  private buf = "";
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private closed = false;
  private wake: (() => void) | null = null;

  constructor(private port: SerialPort) {
    this.reader = port.readable!.getReader();
    this.writer = port.writable!.getWriter();
    void this.pump();
  }

  private async pump() {
    const dec = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        this.buf += dec.decode(value, { stream: true }).replace(/\r/g, "");
        this.wake?.();
      }
    } catch {
      // port went away (the radio reset)
    }
    this.closed = true;
    this.wake?.();
  }

  write(data: Uint8Array | string) {
    return this.writer.write(typeof data === "string" ? new TextEncoder().encode(data) : data);
  }

  async line(ms: number): Promise<string> {
    const t0 = Date.now();
    for (;;) {
      const i = this.buf.indexOf("\n");
      if (i >= 0) {
        const l = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        return l;
      }
      if (this.closed) throw new Error("The radio disconnected.");
      const left = ms - (Date.now() - t0);
      if (left <= 0) throw new Error("The radio stopped answering.");
      await new Promise<void>((r) => {
        const t = setTimeout(r, left);
        this.wake = () => {
          clearTimeout(t);
          r();
        };
      });
      this.wake = null;
    }
  }

  drain() {
    this.buf = "";
  }

  async close() {
    await this.reader.cancel().catch(() => {});
    this.reader.releaseLock();
    this.writer.releaseLock();
    await this.port.close().catch(() => {});
  }
}

/** Sends a command; returns the lines before "OK", throws on "ERR" */
async function command(io: Lines, cmd: string, ms: number, log?: (s: string) => void): Promise<string[]> {
  await io.write(cmd + "\n");
  const out: string[] = [];
  for (;;) {
    const l = await io.line(ms);
    if (l === "OK") return out;
    if (l.startsWith("ERR")) throw new Error(`${cmd.split(" ")[0]}: ${l}`);
    if (l) {
      out.push(l);
      log?.(l);
    }
  }
}

/** Asks our EdgeTX to reboot into the loader */
export async function edgetxToLoader(port: SerialPort) {
  await port.open({ baudRate: 115200 });
  const io = new Lines(port);
  try {
    await io.write("\n");
    await sleep(200);
    await io.write("loader\n");
    await sleep(300);
  } finally {
    await io.close();
  }
}

export class Loader {
  private constructor(private io: Lines) {}

  static async open(port: SerialPort, log: (s: string) => void): Promise<Loader> {
    await port.open({ baudRate: 115200 });
    const io = new Lines(port);
    await io.write("\n");
    await sleep(200);
    io.drain();
    const info = await command(io, "I", 2000);
    const id = info.find((l) => l.startsWith("MONITOR tango2"));
    if (!id) {
      await io.close();
      throw new Error("That port is not the Tango 2 loader.");
    }
    log(id);
    const stayed = info.find((l) => l.startsWith("LOADER"));
    if (stayed) log(stayed);
    return new Loader(io);
  }

  async erase(addr: number, len: number, log: (s: string) => void) {
    const n = Math.ceil(len / SECTOR) * SECTOR;
    const tbs = addr + n > 0x080c0000 ? " ERASE-TBS" : "";
    await command(this.io, `E 0x${addr.toString(16)} 0x${n.toString(16)}${tbs}`, 30000, log);
  }

  /** Programs erased flash; the loader checks the CRC-32 of what landed */
  async write(addr: number, data: Uint8Array, progress?: (done: number) => void) {
    if (addr & 3 || data.length & 3) throw new Error("write must be word aligned");
    await this.io.write(`W 0x${addr.toString(16)} ${data.length} 0x${crc32(data).toString(16)}\n`);
    const ready = await this.io.line(3000);
    if (ready !== "READY") throw new Error(`write refused: ${ready}`);
    // The loader programs as it reads, and STM32 CDC stalls on back-to-back
    // packets: one 64-byte packet at a time, paced.
    for (let i = 0; i < data.length; i += 64) {
      await this.io.write(data.subarray(i, i + 64));
      await sleep(2);
      if ((i & 0x3ff) === 0) progress?.(i);
    }
    progress?.(data.length);
    for (;;) {
      const l = await this.io.line(10000);
      if (l === "OK") return;
      if (l.startsWith("ERR")) throw new Error(`write at 0x${addr.toString(16)}: ${l}`);
    }
  }

  /** Reset into EdgeTX */
  async boot() {
    await command(this.io, "B", 2000).catch(() => {});
    await this.io.close();
  }

  async close() {
    await this.io.close();
  }
}
