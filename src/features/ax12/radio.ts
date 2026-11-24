// Hub commands the configurator uses, all of them ones the Radiomaster app sends.
import type { Frame, Hub } from "./hub";
import { NSRC } from "./model";

export const CMD_INFO = 0x0d;
export const CMD_RADIO = 0x10;

const SUB_STATUS = 0x01;
const SUB_BLOCK = 0x02;
const SUB_FACTORY_RESET = 0x80;
const SUB_REBOOT_ELRS = 0x82;

/** Block ops under 0x10/0x02: model config (cfg) and mixer (mix) blobs. */
const OP = { writeMix: 2, readMix: 4, writeCfg: 5, readCfg: 6 } as const;
const CHUNK = 200;
export const CFG_MAX = 0x400;
export const MIX_MAX = 0x800;

export type DeviceInfo = {
  sysId: number;
  devId: number;
  flySeconds: number;
  buildDate: number;
  name: string;
  version: string;
  hwVersion: number;
};

export type Status = {
  sources: (number | null)[]; // +-500, null for controls this radio doesn't have
  trims: number[]; // -100..100
  sixPosMask: number;
  batteryVolts: number;
  at: number;
};

const u16 = (p: Uint8Array, o: number) => p[o] | (p[o + 1] << 8);
const s16 = (p: Uint8Array, o: number) => (u16(p, o) << 16) >> 16;
const u32 = (p: Uint8Array, o: number) => (p[o] | (p[o + 1] << 8) | (p[o + 2] << 16) | (p[o + 3] << 24)) >>> 0;
const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];

export function fwVersion(v: number) {
  const pad = (n: number, w: number) => n.toString().padStart(w, "0");
  return `${pad(v >>> 24, 2)}.${pad((v >>> 16) & 0xff, 2)}.${pad(v & 0xffff, 4)}`;
}

export async function deviceInfo(hub: Hub): Promise<DeviceInfo> {
  // The app sends a date string here; the MCU ignores it.
  const req = [0xa5, 0x00, ...new TextEncoder().encode("20140902"), 0x00, 0x00, 0x20];
  const f = await hub.request(CMD_INFO, req, (f) => f.cmd === CMD_INFO && f.payload.length >= 0x38);
  const p = f.payload;
  const name = new TextDecoder().decode(p.subarray(0x10, 0x30)).replace(/\0.*$/s, "");
  return {
    sysId: u32(p, 0),
    devId: u32(p, 4),
    flySeconds: u32(p, 8),
    buildDate: u32(p, 0x0c),
    name,
    version: fwVersion(u32(p, 0x30)),
    hwVersion: u32(p, 0x34),
  };
}

export function parseStatus(f: Frame): Status | null {
  const p = f.payload;
  if (f.cmd !== CMD_RADIO || p[0] !== SUB_STATUS || p.length < 81) return null;
  const sources: (number | null)[] = [];
  for (let i = 0; i < NSRC; i++) {
    const v = s16(p, 1 + 2 * i);
    sources.push(v === -0x8000 ? null : v);
  }
  const trims = [0, 1, 2, 3].map((i) => (p[73 + i] << 24) >> 24);
  return { sources, trims, sixPosMask: p[77], batteryVolts: u16(p, 79) / 100, at: performance.now() };
}

async function readBlob(hub: Hub, op: number, max: number) {
  let data = new Uint8Array(0);
  let total = -1;
  while (total < 0 || data.length < total) {
    const off = data.length;
    const f = await hub.request(
      CMD_RADIO,
      [SUB_BLOCK, op, 0, 0, ...le16(off), 0, 0],
      (f) => f.cmd === CMD_RADIO && f.payload[0] === SUB_BLOCK && f.payload[1] === op && u16(f.payload, 4) === off,
    );
    const p = f.payload;
    total = u16(p, 2);
    const n = Math.min(u16(p, 6), p.length - 8);
    if (total > max) throw new Error(`The radio reported a ${total}-byte block, larger than expected.`);
    if (n === 0) break;
    const next = new Uint8Array(off + n);
    next.set(data);
    next.set(p.subarray(8, 8 + n), off);
    data = next;
  }
  return data.slice(0, total);
}

async function writeBlob(hub: Hub, op: number, blob: Uint8Array, max: number, progress?: (n: number) => void) {
  // The MCU firmware doesn't bounds-check these writes, so never send more than it holds.
  if (blob.length > max) throw new Error(`Refusing to write ${blob.length} bytes; the radio holds ${max}.`);
  for (let off = 0; off < blob.length; off += CHUNK) {
    const n = Math.min(CHUNK, blob.length - off);
    const payload = [SUB_BLOCK, op, ...le16(blob.length), ...le16(off), ...le16(n), ...blob.subarray(off, off + n)];
    await hub.request(
      CMD_RADIO,
      payload,
      (f) => f.cmd === CMD_RADIO && f.payload[0] === SUB_BLOCK && f.payload[1] === op && u16(f.payload, 4) === off,
    );
    progress?.(off + n);
  }
}

export type ModelBlobs = { cfg: Uint8Array; mix: Uint8Array };

export async function readModel(hub: Hub): Promise<ModelBlobs> {
  const cfg = await readBlob(hub, OP.readCfg, CFG_MAX);
  const mix = await readBlob(hub, OP.readMix, MIX_MAX);
  return { cfg, mix };
}

/** Writes config then mixer, the order the app uses, then reads both back to check. */
export async function writeModel(hub: Hub, m: ModelBlobs, progress?: (frac: number) => void) {
  const total = m.cfg.length + m.mix.length;
  await writeBlob(hub, OP.writeCfg, m.cfg, CFG_MAX, (n) => progress?.(n / total));
  await writeBlob(hub, OP.writeMix, m.mix, MIX_MAX, (n) => progress?.((m.cfg.length + n) / total));
  const back = await readModel(hub);
  if (!sameBytes(back.cfg, m.cfg) || !sameBytes(back.mix, m.mix)) {
    throw new Error("The radio accepted the model, but reading it back doesn't match. Read it again before flying.");
  }
  return back;
}

export async function factoryReset(hub: Hub) {
  await hub.request(
    CMD_RADIO,
    [SUB_FACTORY_RESET, 0x01],
    (f) => f.cmd === CMD_RADIO && f.payload[0] === SUB_FACTORY_RESET,
    1500,
    1,
  );
}

export function rebootElrs(hub: Hub) {
  return hub.send(CMD_RADIO, [SUB_REBOOT_ELRS, 0x01]);
}

export function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
