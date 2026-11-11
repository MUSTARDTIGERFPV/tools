/// <reference types="w3c-web-serial" />
import type { Before, IEspLoaderTerminal } from "esptool-js";

// UnifiedConfiguration.appendToFirmware writes this block right after the
// application image: product name, lua name, options JSON, layout JSON.
const PRODUCT_LEN = 128;
const DEVICE_LEN = 16;
const OPTIONS_LEN = 512;
const LAYOUT_LEN = 2048;
export const TRAILER_LEN = PRODUCT_LEN + DEVICE_LEN + OPTIONS_LEN + LAYOUT_LEN;

const PARTITION_TABLE_OFFSET = 0x8000;
const PARTITION_TABLE_LEN = 0xc00;
const PARTITION_MAGIC = 0x50aa;
const TYPE_APP = 0;
const TYPE_DATA = 1;
const SUBTYPE_DATA_OTA = 0;
const SUBTYPE_DATA_SPIFFS = 0x82;
const ESP_SPI_SET_PARAMS = 0x0b;

// Files the web UI writes into LittleFS. hardware.json always shadows the
// trailer layout; options.json does while its flash-discriminator matches.
export const OVERRIDE_FILES = ["options.json", "hardware.json"] as const;

const FLASH_VENDORS: Record<number, string> = {
  0x0b: "XTX",
  0x1c: "EON",
  0x20: "XMC / Micron",
  0x5e: "Zbit",
  0x68: "Boya",
  0x85: "Puya",
  0x9d: "ISSI",
  0xa1: "Fudan",
  0xc2: "Macronix",
  0xc8: "GigaDevice",
  0xef: "Winbond",
};

export type Partition = { type: number; subtype: number; offset: number; size: number; label: string };

export type Trailer = {
  offset: number;
  productName: string;
  deviceName: string;
  options: Record<string, unknown> | null;
  optionsRaw: string;
  layout: Record<string, unknown> | null;
  layoutRaw: string;
};

export type ImageSlot = { label: string; offset: number; active: boolean; trailer: Trailer | null; empty: boolean };

export type ChipInfo = {
  family: string;
  description: string;
  revision: number | null;
  features: string[];
  crystalMhz: number | null;
  mac: string;
  flashId: number | null;
  flashVendor: string | null;
  flashSize: string | null;
  secureDownload: boolean;
};

export type FlashReport = {
  partitions: Partition[];
  images: ImageSlot[];
  overrides: Record<string, boolean> | null;
  bytesRead: number;
};

export type DeviceReport = FlashReport & { chip: ChipInfo };

export type ReadFlash = (addr: number, size: number) => Promise<Uint8Array>;

export type ReadOptions = {
  baud: number;
  before: Before;
  allSlots: boolean;
  scanOverrides: boolean;
  resetAfter: boolean;
  log: (line: string) => void;
  progress?: (bytesRead: number) => void;
};

const decoder = new TextDecoder("utf-8");

function u32(buf: Uint8Array, at: number) {
  return new DataView(buf.buffer, buf.byteOffset + at, 4).getUint32(0, true);
}

function u16(buf: Uint8Array, at: number) {
  return new DataView(buf.buffer, buf.byteOffset + at, 2).getUint16(0, true);
}

/** Random access to flash through cached 4 KiB reads. */
class FlashReader {
  static BLOCK = 0x1000;
  private cache = new Map<number, Uint8Array>();
  bytesRead = 0;

  constructor(
    private readFlash: ReadFlash,
    private onRead?: (bytesRead: number) => void,
  ) {}

  async read(offset: number, length: number) {
    const first = Math.floor(offset / FlashReader.BLOCK);
    const last = Math.floor((offset + length - 1) / FlashReader.BLOCK);
    // Fetch runs of missing blocks in one command, so a big scan is one read.
    let blk = first;
    while (blk <= last) {
      if (this.cache.has(blk)) {
        blk++;
        continue;
      }
      let end = blk;
      while (end + 1 <= last && !this.cache.has(end + 1)) end++;
      const count = end - blk + 1;
      const data = await this.readFlash(blk * FlashReader.BLOCK, count * FlashReader.BLOCK);
      for (let i = 0; i < count; i++) {
        this.cache.set(blk + i, data.subarray(i * FlashReader.BLOCK, (i + 1) * FlashReader.BLOCK));
      }
      this.bytesRead += count * FlashReader.BLOCK;
      this.onRead?.(this.bytesRead);
      blk = end + 1;
    }
    const out = new Uint8Array((last - first + 1) * FlashReader.BLOCK);
    for (let b = first; b <= last; b++) out.set(this.cache.get(b)!, (b - first) * FlashReader.BLOCK);
    const start = offset - first * FlashReader.BLOCK;
    return out.subarray(start, start + length);
  }

  async u32(offset: number) {
    return u32(await this.read(offset, 4), 0);
  }
}

/** UnifiedConfiguration.findFirmwareEnd() on live flash: where the trailer starts. */
async function findImageEnd(reader: FlashReader, base: number) {
  let header = await reader.read(base, 2);
  let segments = header[1];
  if (header[0] !== 0xe9) return null;

  let pos: number;
  let is8285 = false;
  if (segments === 2) {
    // ESP8266/8285 v2 image: the real header is at +0x1000.
    const base8266 = base + 0x1000;
    header = await reader.read(base8266, 2);
    if (header[0] !== 0xe9) return null;
    segments = header[1];
    pos = base8266 + 8;
    is8285 = true;
  } else {
    pos = base + 24; // ESP32 extended header
  }

  for (let i = 0; i < segments; i++) {
    const seg = await reader.read(pos, 8);
    pos += 8 + u32(seg, 4);
  }

  let rel = pos - base;
  rel = (rel + 16) & ~15; // checksum byte, padded to 16
  if (!is8285) rel += 32; // appended SHA-256
  return base + rel;
}

async function readPartitions(reader: FlashReader) {
  const blob = await reader.read(PARTITION_TABLE_OFFSET, PARTITION_TABLE_LEN);
  const parts: Partition[] = [];
  for (let i = 0; i + 32 <= blob.length; i += 32) {
    if (u16(blob, i) !== PARTITION_MAGIC) break;
    const labelBytes = blob.subarray(i + 12, i + 28);
    const nul = labelBytes.indexOf(0);
    parts.push({
      type: blob[i + 2],
      subtype: blob[i + 3],
      offset: u32(blob, i + 4),
      size: u32(blob, i + 8),
      label: decoder.decode(nul < 0 ? labelBytes : labelBytes.subarray(0, nul)),
    });
  }
  return parts;
}

async function activeOtaSlot(reader: FlashReader, parts: Partition[], otaCount: number) {
  const otadata = parts.find((p) => p.type === TYPE_DATA && p.subtype === SUBTYPE_DATA_OTA);
  if (!otadata || otaCount === 0) return null;
  let best: number | null = null;
  for (const sector of [0, 0x1000]) {
    const seq = await reader.u32(otadata.offset + sector);
    if (seq === 0 || seq === 0xffffffff) continue;
    if (best === null || seq > best) best = seq;
  }
  return best === null ? null : (best - 1) % otaCount;
}

function cstr(blob: Uint8Array) {
  const nul = blob.indexOf(0);
  return decoder.decode(nul < 0 ? blob : blob.subarray(0, nul)).trim();
}

function asJson(raw: string) {
  if (!raw.startsWith("{")) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function parseTrailer(reader: FlashReader, offset: number): Promise<Trailer | null> {
  const blob = await reader.read(offset, TRAILER_LEN);
  if (blob[0] === 0xff || blob[0] === 0x00) return null; // bare firmware
  let p = 0;
  const productName = cstr(blob.subarray(p, (p += PRODUCT_LEN)));
  const deviceName = cstr(blob.subarray(p, (p += DEVICE_LEN)));
  const optionsRaw = cstr(blob.subarray(p, (p += OPTIONS_LEN)));
  const layoutRaw = cstr(blob.subarray(p, (p += LAYOUT_LEN)));
  return {
    offset,
    productName,
    deviceName,
    options: asJson(optionsRaw),
    optionsRaw,
    layout: asJson(layoutRaw),
    layoutRaw,
  };
}

/**
 * LittleFS keeps file names as plain text in its metadata, so a substring
 * search over the partition finds them without a LittleFS parser.
 */
async function scanOverrides(reader: FlashReader, parts: Partition[]) {
  const spiffs = parts.find((p) => p.type === TYPE_DATA && p.subtype === SUBTYPE_DATA_SPIFFS);
  if (!spiffs) return null;
  const blob = await reader.read(spiffs.offset, spiffs.size);
  const out: Record<string, boolean> = {};
  for (const name of OVERRIDE_FILES) out[name] = indexOf(blob, new TextEncoder().encode(name)) >= 0;
  return out;
}

function indexOf(haystack: Uint8Array, needle: Uint8Array) {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

function sizeBytes(size: string) {
  const m = /^(\d+)(KB|MB)$/.exec(size);
  if (!m) return null;
  return Number(m[1]) * (m[2] === "MB" ? 1024 * 1024 : 1024);
}

function packU32(...values: number[]) {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => view.setUint32(i * 4, v >>> 0, true));
  return out;
}

export function serialSupported() {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

/** Ask for a port, connect to the ESP bootloader, and read everything identify needs. */
export async function identifyDevice(opts: ReadOptions): Promise<DeviceReport> {
  const port = await navigator.serial.requestPort();
  // esptool-js and its chip stubs are big; only fetch them once someone connects.
  const { ESPLoader, Transport } = await import("esptool-js");
  const transport = new Transport(port, false);
  const terminal: IEspLoaderTerminal = {
    clean: () => {},
    writeLine: (data) => opts.log(data),
    write: (data) => opts.log(data),
  };
  const esp = new ESPLoader({ transport, baudrate: opts.baud, romBaudrate: 115200, terminal });

  try {
    const description = await esp.main(opts.before);
    const rom = esp.chip;
    const secureDownload = esp.secureDownloadMode;

    let features: string[] = [];
    let crystalMhz: number | null = null;
    let revision: number | null = null;
    let mac = "";
    if (!secureDownload) {
      features = await rom.getChipFeatures(esp);
      crystalMhz = await rom.getCrystalFreq(esp);
      revision = rom.getChipRevision ? await rom.getChipRevision(esp) : null;
      mac = await rom.readMac(esp);
    }

    let flashId: number | null = null;
    let flashSize: string | null = null;
    try {
      flashId = await esp.readFlashId();
      flashSize = esp.DETECTED_FLASH_SIZES[(flashId >> 16) & 0xff] ?? null;
    } catch {
      opts.log("Could not read the flash ID");
    }
    // Tell the stub the real flash size, as esptool's flash_set_parameters does,
    // so reads above the ROM default size work.
    const total = flashSize ? sizeBytes(flashSize) : null;
    if (total) {
      try {
        await esp.checkCommand("set SPI params", ESP_SPI_SET_PARAMS, packU32(0, total, 0x10000, 0x1000, 0x100, 0xffff));
      } catch {
        opts.log("Stub did not accept SPI params; continuing with defaults");
      }
    }

    const chip: ChipInfo = {
      family: rom.CHIP_NAME,
      description,
      revision,
      features,
      crystalMhz,
      mac,
      flashId,
      flashVendor: flashId === null ? null : (FLASH_VENDORS[flashId & 0xff] ?? null),
      flashSize,
      secureDownload,
    };

    const flash = await analyzeFlash((addr, size) => esp.readFlash(addr, size), rom.CHIP_NAME, opts);

    if (opts.resetAfter) await esp.after("hard_reset");

    return { chip, ...flash };
  } finally {
    try {
      await transport.disconnect();
    } catch {
      // port already gone
    }
  }
}

/** Find the partitions, the app images, their trailers, and any LittleFS overrides. */
export async function analyzeFlash(
  readFlash: ReadFlash,
  family: string,
  opts: Pick<ReadOptions, "allSlots" | "scanOverrides" | "log" | "progress">,
): Promise<FlashReport> {
  const reader = new FlashReader(readFlash, opts.progress);
  const is8266 = family.startsWith("ESP8266") || family.startsWith("ESP8285");
  const partitions = is8266 ? [] : await readPartitions(reader);

  let slots: { label: string; offset: number; active: boolean }[];
  if (is8266) {
    slots = [{ label: "app", offset: 0, active: true }];
  } else {
    const apps = partitions.filter((p) => p.type === TYPE_APP);
    const otaApps = apps.filter((p) => p.subtype >= 0x10 && p.subtype <= 0x1f).sort((a, b) => a.subtype - b.subtype);
    const slot = await activeOtaSlot(reader, partitions, otaApps.length);
    const active = slot !== null && slot < otaApps.length ? otaApps[slot] : apps[0];
    slots = apps
      .map((p) => ({ label: p.label, offset: p.offset, active: !!active && p.offset === active.offset }))
      .filter((s) => s.active || opts.allSlots)
      .sort((a, b) => Number(b.active) - Number(a.active));
  }

  const images: ImageSlot[] = [];
  for (const slot of slots) {
    opts.log(`Walking image in ${slot.label} @ 0x${slot.offset.toString(16)}`);
    const end = await findImageEnd(reader, slot.offset);
    images.push({ ...slot, empty: end === null, trailer: end === null ? null : await parseTrailer(reader, end) });
  }

  let overrides: Record<string, boolean> | null = null;
  if (opts.scanOverrides && partitions.length) {
    opts.log("Scanning LittleFS for options.json / hardware.json");
    overrides = await scanOverrides(reader, partitions);
  }

  return { partitions, images, overrides, bytesRead: reader.bytesRead };
}
