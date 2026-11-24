/// <reference types="w3c-web-serial" />
// The Radiomaster AX12's handset MCU speaks Flyshark "hub" frames on its DSC USB
// serial port (the same frames the Android app uses on its internal UART):
//
//   a6 LEN CMD SRC DST payload... CRC8
//
// LEN is the whole frame (payload + 6). CRC8 is Dallas/Maxim (reflected 0x8C,
// init 0) over LEN..payload. The app is address 4, the MCU is address 2.

export const AX12_FILTER = { usbVendorId: 0x2e3c };
export const ADDR_APP = 4;
export const ADDR_MCU = 2;
const SYNC = 0xa6;

export type Frame = { cmd: number; src: number; dst: number; payload: Uint8Array };

export const serialSupported = () => typeof navigator !== "undefined" && "serial" in navigator;

export function crc8(p: Uint8Array, from = 0, to = p.length) {
  let c = 0;
  for (let i = from; i < to; i++) {
    c ^= p[i];
    for (let b = 0; b < 8; b++) c = c & 1 ? (c >>> 1) ^ 0x8c : c >>> 1;
  }
  return c;
}

export function frame(cmd: number, payload: ArrayLike<number>, dst = ADDR_MCU, src = ADDR_APP) {
  const n = payload.length;
  if (n > 249) throw new Error("hub payload too long");
  const f = new Uint8Array(n + 6);
  f[0] = SYNC;
  f[1] = n + 6;
  f[2] = cmd;
  f[3] = src;
  f[4] = dst;
  f.set(payload, 5);
  f[5 + n] = crc8(f, 1, 5 + n);
  return f;
}

/** Splits a byte stream into checked frames, resyncing on bad lengths or CRCs. */
export class FrameParser {
  private buf = new Uint8Array(0);

  push(data: Uint8Array): Frame[] {
    const b = new Uint8Array(this.buf.length + data.length);
    b.set(this.buf);
    b.set(data, this.buf.length);
    const out: Frame[] = [];
    let i = 0;
    while (i < b.length) {
      if (b[i] !== SYNC) {
        i++;
        continue;
      }
      if (i + 2 > b.length) break;
      const len = b[i + 1];
      if (len < 6) {
        i++;
        continue;
      }
      if (i + len > b.length) break;
      if (crc8(b, i + 1, i + len - 1) !== b[i + len - 1]) {
        i++;
        continue;
      }
      out.push({ cmd: b[i + 2], src: b[i + 3], dst: b[i + 4], payload: b.slice(i + 5, i + len - 1) });
      i += len;
    }
    this.buf = b.slice(i);
    return out;
  }
}

type Waiter = { match: (f: Frame) => boolean; resolve: (f: Frame) => void };

export class Hub {
  private parser = new FrameParser();
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private waiters: Waiter[] = [];
  private listeners = new Set<(f: Frame) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  closed = false;
  onClose?: () => void;

  private constructor(private port: SerialPort) {
    this.reader = port.readable!.getReader();
    this.writer = port.writable!.getWriter();
    void this.pump();
  }

  static async open(port: SerialPort) {
    // The baud rate is ignored by the MCU's USB port; any value works.
    await port.open({ baudRate: 921600, bufferSize: 4096 });
    return new Hub(port);
  }

  private async pump() {
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        for (const f of this.parser.push(value)) {
          for (const l of this.listeners) l(f);
          const w = this.waiters.findIndex((x) => x.match(f));
          if (w >= 0) this.waiters.splice(w, 1)[0].resolve(f);
        }
      }
    } catch {
      // unplugged
    }
    this.closed = true;
    this.onClose?.();
  }

  listen(fn: (f: Frame) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  send(cmd: number, payload: ArrayLike<number>) {
    if (this.closed) throw new Error("The radio disconnected.");
    return this.writer.write(frame(cmd, payload));
  }

  /** Sends a frame and waits for the first reply `match` accepts. Requests run one at a time. */
  request(cmd: number, payload: ArrayLike<number>, match: (f: Frame) => boolean, ms = 1000, tries = 3) {
    const run = async () => {
      for (let t = 0; t < tries; t++) {
        let w!: Waiter;
        const got = new Promise<Frame>((resolve) => {
          w = { match, resolve };
          this.waiters.push(w);
        });
        await this.send(cmd, payload);
        const f = await Promise.race([got, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
        if (f) return f;
        this.waiters = this.waiters.filter((x) => x !== w);
        if (this.closed) break;
      }
      throw new Error(this.closed ? "The radio disconnected." : "The radio didn't answer.");
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  async close() {
    this.closed = true;
    await this.reader.cancel().catch(() => {});
    this.reader.releaseLock();
    this.writer.releaseLock();
    await this.port.close().catch(() => {});
  }
}
