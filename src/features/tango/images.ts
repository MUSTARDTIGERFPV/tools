// Image handling for the Two to Tango flasher: the TBS Crossfire catalog file
// (which we never host), the ExpressLRS image and its bind UID, and the CRCs
// the radio's bootloader and loader check.

// Tango 2s come with one of two Crossfire radio boards, and TBS publishes a
// 6.30 build for each: 0x000140xx ("Crossfire Tango II") selects the SX1272's
// RFO pin, 0x000141xx (listed as "Crossfire Micro TX") its PA_BOOST pin. The
// wrong one transmits nothing. The TBS bootloader records which board a radio
// has (BOARD_ID_ADDR), and EdgeTX recognises exactly these two files.
export const CROSSFIRE_LABEL = "Crossfire 6.48";
export const CROSSFIRE_VERSION = 0x0630;
export const CROSSFIRE_CATALOG = "https://firmware.blacksheep.com.sg/json/catalog";
export const BOARD_ID_ADDR = 0x08007f04;

export type CrossfireBuild = { family: number; file: string; url: string; sha256: string; tbsName: string };
export const CROSSFIRE_BUILDS: CrossfireBuild[] = [
  {
    family: 0x0141,
    file: "0x000141xx_0x0630.bin",
    url: "https://firmware.blacksheep.com.sg/firmware/0x000141xx_0x0630.bin",
    sha256: "d32338c61afb90eac153bd945a84de06d980124c4d9e0861afa03b09e2fc4825",
    tbsName: "Crossfire Micro TX",
  },
  {
    family: 0x0140,
    file: "0x000140xx_0x0630.bin",
    url: "https://firmware.blacksheep.com.sg/firmware/0x000140xx_0x0630.bin",
    sha256: "e37f7a9a849a8424e9e6d8dd4992e542655621af670b7ba62734da5a851961b5",
    tbsName: "Crossfire Tango II",
  },
];
export const familyName = (f: number) => `0x${f.toString(16).padStart(4, "0")}xx`;

// Flash map (sectors 10-11 hold both radio images as one 256 KB slot)
export const EDGETX_ADDR = 0x08020000;
export const EDGETX_MAX = 0xa0000;
export const SLOT_ADDR = 0x080c0000;
export const SLOT_SIZE = 0x40000;
export const CROSSFIRE_MAX = 0x28000;
export const ELRS_ADDR = 0x080e8000;
export const ELRS_MAX = 0x18000;

const ELRS_MAGIC = 0x3252454c; // "LER2"
const ELRS_HEADER_SIZE = 60;
const UID_MAGIC = "T2UID01\0";

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function crc8D5(data: Uint8Array): number {
  let c = 0;
  for (const b of data) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0xd5) & 0xff : (c << 1) & 0xff;
  }
  return c;
}

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** zlib CRC-32, as the loader and the ELRS image header use it */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC32_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function reflect(v: number, n: number): number {
  let r = 0;
  for (let i = 0; i < n; i++) {
    r = (r << 1) | (v & 1);
    v >>>= 1;
  }
  return r >>> 0;
}

/**
 * The TBS bootloader's image CRC. CRC-32 shaped, but the feedback is
 * (top bit OR data bit) rather than XOR, so it saturates on anything over a
 * few KB. It verifies nothing; the bootloader just wants it to match.
 */
export function tbsCrc32(data: Uint8Array): number {
  let e = 0xffffffff;
  for (const b of data) {
    let l = reflect(b, 8);
    for (let i = 0; i < 8; i++) {
      const fb = (e & 0x80000000) !== 0 || (l & 0x80) !== 0;
      e = ((e << 1) ^ (fb ? 0x04c11db7 : 0)) >>> 0;
      l = (l << 1) & 0xff;
    }
  }
  return (reflect(e, 32) ^ 0xffffffff) >>> 0;
}

export type Crossfire = { build: CrossfireBuild; image: Uint8Array };

/** The Crossfire image from a TBS catalog file, ready to go at 0x080C0000 */
export async function crossfireFromCatalog(file: Uint8Array): Promise<Crossfire> {
  const len = (file[8] << 16) | (file[9] << 8) | file[10];
  if (file.length < 12 || file.length !== 12 + len) throw new Error("Not a TBS firmware file.");
  const family = (file[2] << 8) | file[3];
  const version = (file[5] << 8) | file[6];
  const build = CROSSFIRE_BUILDS.find((b) => b.family === family);
  if (!build) {
    throw new Error(
      `That file is for TBS device ${familyName(family)}, not a Tango 2 Crossfire board. ` +
        `Use ${CROSSFIRE_BUILDS.map((b) => b.file).join(" or ")}.`,
    );
  }
  if (version !== CROSSFIRE_VERSION || (await sha256Hex(file)) !== build.sha256) {
    throw new Error(
      `That is Crossfire ${(version >> 8).toString(16)}.${(version & 0xff).toString(16).padStart(2, "0")}, ` +
        `or a different build of it. This EdgeTX build hosts exactly ${build.file}.`,
    );
  }
  const image = file.subarray(11, 11 + len);
  const v = new DataView(image.buffer, image.byteOffset, image.byteLength);
  if (v.getUint32(0, true) !== 0x20020000 || v.getUint32(4, true) !== SLOT_ADDR + 0x21) {
    throw new Error("Unexpected Crossfire image layout.");
  }
  let used = image.length;
  while (used > 0 && image[used - 1] === 0xff) used--;
  if (used > CROSSFIRE_MAX) throw new Error("Crossfire image is larger than its space in flash.");
  return { build, image: image.slice(0, used) };
}

export function checkElrs(image: Uint8Array): { version: string } {
  const v = new DataView(image.buffer, image.byteOffset, image.byteLength);
  if (image.length < ELRS_HEADER_SIZE || v.getUint32(0, true) !== ELRS_MAGIC) throw new Error("Bad ELRS image.");
  const size = v.getUint32(8, true);
  if (size !== image.length || size > ELRS_MAX) throw new Error("ELRS image size mismatch.");
  if (crc32(image.subarray(ELRS_HEADER_SIZE)) !== v.getUint32(12, true)) throw new Error("ELRS image CRC mismatch.");
  return { version: `ABI ${v.getUint16(4, true)}.${v.getUint16(6, true)}` };
}

/** ExpressLRS's UID for a bind phrase: md5('-DMY_BINDING_PHRASE="<phrase>"')[0:6] */
export function uidFromPhrase(phrase: string): Uint8Array {
  return md5(new TextEncoder().encode(`-DMY_BINDING_PHRASE="${phrase}"`)).slice(0, 6);
}

/** A copy of the ELRS image with its flashed UID set (or cleared), CRC fixed */
export function withUid(image: Uint8Array, uid: Uint8Array | null): Uint8Array {
  const out = image.slice();
  const magic = new TextEncoder().encode(UID_MAGIC);
  let at = -1;
  outer: for (let i = ELRS_HEADER_SIZE; i <= out.length - magic.length - 7; i++) {
    for (let j = 0; j < magic.length; j++) if (out[i + j] !== magic[j]) continue outer;
    at = i + magic.length;
    break;
  }
  if (at < 0) throw new Error("This ELRS image has no bind-phrase slot.");
  out[at] = uid ? 1 : 0;
  out.set(uid ?? new Uint8Array(6), at + 1);
  new DataView(out.buffer).setUint32(12, crc32(out.subarray(ELRS_HEADER_SIZE)), true);
  return out;
}

export const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Pads to a multiple of `n` with 0xFF (erased flash) */
export function padFF(data: Uint8Array, n: number): Uint8Array {
  const len = Math.ceil(data.length / n) * n;
  if (len === data.length) return data;
  const out = new Uint8Array(len).fill(0xff);
  out.set(data);
  return out;
}

// MD5 (RFC 1321). Only for the bind-phrase UID; WebCrypto has no MD5.
function md5(msg: Uint8Array): Uint8Array {
  const s = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const K = new Uint32Array(64).map((_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));
  const len = ((msg.length + 8) >>> 6) * 64 + 64;
  const buf = new Uint8Array(len);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(len - 8, (msg.length * 8) >>> 0, true);
  dv.setUint32(len - 4, Math.floor((msg.length * 8) / 2 ** 32), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < len; off += 64) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) [f, g] = [(b & c) | (~b & d), i];
      else if (i < 32) [f, g] = [(d & b) | (~d & c), (5 * i + 1) % 16];
      else if (i < 48) [f, g] = [b ^ c ^ d, (3 * i + 5) % 16];
      else [f, g] = [c ^ (b | ~d), (7 * i) % 16];
      const x = (a + f + K[i] + dv.getUint32(off + g * 4, true)) >>> 0;
      const r = s[(i >> 4) * 4 + (i % 4)];
      a = d;
      d = c;
      c = b;
      b = (b + ((x << r) | (x >>> (32 - r)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((w, i) => ov.setUint32(i * 4, w, true));
  return out;
}
