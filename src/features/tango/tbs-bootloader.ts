/// <reference types="w3c-web-hid" />
// The TBS Tango 2 bootloader's USB HID update protocol (as used by Wingman's
// flasher): CRSF frames in 64-byte reports. It writes the app area from
// 0x0800C000; here it only ever installs the resident loader.
import { crc8D5, tbsCrc32 } from "./images";

const VID = 0x04d8;
const PID = 0xf94c;
const HW_ID = 0x00040001; // what Wingman sends; any 0x000400xx radio accepts it
const VERSION_FIELD = 0x0128;
const WINDOW = 6144;
const BLOCK = 48;
const ADDR_HOST = 0x10;
const ADDR_BL = 0xea;
const T_PING = 0x28;
const T_INFO = 0x29;
const T_FW = 0x38;
const KEEPALIVE = new Uint8Array([0xc8, 0x07, 0x32, 0xea, 0x10, 0x0a, 0x04, 0xc6, 0x7e]);

type Frame = { type: number; dest: number; orig: number; body: Uint8Array };

export const hidSupported = () => typeof navigator !== "undefined" && "hid" in navigator;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function frame(type: number, dest: number, orig: number, payload: Uint8Array = new Uint8Array()) {
  const body = new Uint8Array([type, dest, orig, ...payload]);
  return new Uint8Array([0xc8, body.length + 1, ...body, crc8D5(body)]);
}

function parse(r: Uint8Array): Frame | null {
  if (r.length < 5 || r[0] !== 0xc8) return null;
  const end = r[1] + 2;
  if (end > r.length || end < 5) return null;
  if (crc8D5(r.subarray(2, end - 1)) !== r[end - 1]) return null;
  return { type: r[2], dest: r[3], orig: r[4], body: r.slice(5, end - 1) };
}

class Bootloader {
  private queue: Frame[] = [];
  private wake: (() => void) | null = null;

  constructor(private dev: HIDDevice) {
    dev.addEventListener("inputreport", (e) => {
      const f = parse(new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength));
      if (!f) return;
      this.queue.push(f);
      this.wake?.();
    });
  }

  async send(data: Uint8Array) {
    const buf = new Uint8Array(64);
    buf.set(data);
    await this.dev.sendReport(0, buf);
  }

  /** next frame, or null after `ms` */
  async recv(ms: number): Promise<Frame | null> {
    if (!this.queue.length) {
      await new Promise<void>((r) => {
        const t = setTimeout(r, ms);
        this.wake = () => {
          clearTimeout(t);
          r();
        };
      });
      this.wake = null;
    }
    return this.queue.shift() ?? null;
  }
}

export async function requestBootloader(): Promise<HIDDevice | null> {
  const [dev] = await navigator.hid.requestDevice({ filters: [{ vendorId: VID, productId: PID }] });
  return dev ?? null;
}

/** Validates an image for the TBS bootloader's app area (0x0800C000-0x080BFFFF) */
export function checkAppImage(img: Uint8Array) {
  const v = new DataView(img.buffer, img.byteOffset, img.byteLength);
  const sp = v.getUint32(0, true);
  const rv = v.getUint32(4, true);
  if (img.length < 8 || img.length > 0xb4000) throw new Error("Image size out of range for the TBS bootloader.");
  if (!(sp === 0x10010000 || (sp >= 0x20000000 && sp <= 0x20020000))) throw new Error("Image has a bad stack pointer.");
  if (!(rv & 1) || rv - 1 < 0x0800c000 || rv - 1 > 0x080bffff) throw new Error("Image reset vector is outside the app area.");
}

export async function flashViaBootloader(
  dev: HIDDevice,
  image: Uint8Array,
  on: { log: (s: string) => void; progress: (fraction: number) => void },
) {
  checkAppImage(image);
  const size = Math.ceil(image.length / WINDOW) * WINDOW;
  const padded = new Uint8Array(size).fill(0xff);
  padded.set(image);
  const crc = tbsCrc32(padded);

  if (!dev.opened) await dev.open();
  try {
    const bl = new Bootloader(dev);
    await bl.send(frame(T_PING, 0x00, 0x0e));
    let ok = false;
    for (const t0 = Date.now(); Date.now() - t0 < 2000 && !ok; ) {
      const f = await bl.recv(100);
      if (f?.type !== T_INFO) continue;
      const z = f.body.indexOf(0);
      if (z < 0 || z + 13 > f.body.length) continue;
      const name = new TextDecoder().decode(f.body.subarray(0, z));
      const dv = new DataView(f.body.buffer, f.body.byteOffset + z + 1, 12);
      const hwId = dv.getUint32(4);
      const fwId = dv.getUint32(8);
      on.log(`${name}, hwId 0x${hwId.toString(16).padStart(8, "0")}`);
      ok = name === "TBS BOOTLOADER" && f.orig === ADDR_BL && fwId === 0 && hwId >>> 8 === HW_ID >>> 8;
    }
    if (!ok) throw new Error("The radio did not answer as a Tango 2 TBS bootloader. Nothing was written.");

    const start = new Uint8Array(16);
    const sv = new DataView(start.buffer);
    sv.setUint8(0, 1);
    sv.setUint32(2, HW_ID);
    sv.setUint16(6, VERSION_FIELD);
    sv.setUint32(8, size);
    sv.setUint32(12, crc);
    await bl.send(frame(T_FW, ADDR_BL, ADDR_HOST, start));
    on.log(`Writing ${image.length} bytes (${size / WINDOW} blocks of 6 KB)`);

    let lastKa = 0;
    const keepalive = async () => {
      if (Date.now() - lastKa > 1000) {
        lastKa = Date.now();
        await bl.send(KEEPALIVE);
      }
    };
    let lastWindow = -1;
    let lastConfirm = -1;
    let lastRx = Date.now();
    let erasing = -1;
    for (;;) {
      await keepalive();
      const f = await bl.recv(50);
      if (!f) {
        if (Date.now() - lastRx > 20000) throw new Error("No answer from the radio for 20 s. It is still in its bootloader; try again.");
        continue;
      }
      lastRx = Date.now();
      if (f.type !== T_FW || !f.body.length) continue;
      const sub = f.body[0];
      const rest = f.body.subarray(1);
      const rv = new DataView(rest.buffer, rest.byteOffset, rest.byteLength);
      if (sub === 7) {
        const pct = rest[0] ?? 0;
        if (pct !== erasing && pct % 25 === 0) on.log(`Erasing ${pct}%`);
        erasing = pct;
      } else if (sub === 2 && rest.length >= 12) {
        const off = rv.getUint32(0);
        const x = rv.getUint32(4);
        if (off === 0 && x === 0) {
          on.progress(1);
          on.log("Bootloader reports the write complete");
          return;
        }
        if (off === lastWindow) continue;
        if (off % WINDOW || off + WINDOW > size) throw new Error(`Radio asked for block 0x${off.toString(16)}, outside the image.`);
        for (let i = 0; i < WINDOW / BLOCK; i++) {
          const a = off + i * BLOCK;
          await bl.send(frame(T_FW, ADDR_BL, ADDR_HOST, new Uint8Array([3, i, 0x80, ...padded.subarray(a, a + BLOCK)])));
          await sleep(20);
          await keepalive();
        }
        lastWindow = off;
        on.progress((off + WINDOW) / size);
      } else if (sub === 5 && rest.length >= 21) {
        const blank = rest.subarray(0, 16).every((b) => b === 0xff);
        const addr = rv.getUint32(17);
        if (blank && addr !== lastConfirm && addr === lastWindow) {
          lastConfirm = addr;
          await bl.send(frame(T_FW, ADDR_BL, ADDR_HOST, new Uint8Array([4])));
        }
      }
    }
  } finally {
    await dev.close().catch(() => {});
  }
}
