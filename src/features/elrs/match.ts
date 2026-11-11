import type { Trailer } from "./device";

type Layout = Record<string, unknown>;

export type TargetEntry = {
  target: string;
  product_name: string;
  lua_name?: string;
  firmware: string;
  platform?: string;
  layout_file?: string;
  overlay?: Layout;
};

export type TargetsDb = {
  ref: string;
  fetched: string;
  targets: TargetEntry[];
  layouts: Record<string, Layout>;
};

export type LayoutDiff = { key: string; device: unknown; target: unknown; tuning: boolean };

export type TargetMatch = {
  entry: TargetEntry;
  score: number;
  reasons: string[];
  pinMatch: number | null;
  layoutMatch: number | null;
  diff: LayoutDiff[] | null;
};

const PLATFORM_FOR_CHIP: [string, string[]][] = [
  ["ESP32-C3", ["esp32-c3"]],
  ["ESP32-S3", ["esp32-s3"]],
  ["ESP32-S2", ["esp32-s2"]],
  ["ESP8266", ["esp8285", "esp8266"]],
  ["ESP8285", ["esp8285", "esp8266"]],
  ["ESP32", ["esp32"]],
];

export async function loadTargets(): Promise<TargetsDb> {
  const res = await fetch("/elrs/targets.json");
  if (!res.ok) throw new Error(`targets.json: HTTP ${res.status}`);
  return res.json();
}

/** The layout the build writes into the trailer: layout_file merged with the overlay. */
function buildLayout(db: TargetsDb, entry: TargetEntry): Layout | null {
  if (!entry.layout_file) return null;
  const base = db.layouts[entry.layout_file];
  if (!base) return null;
  return { ...base, ...(entry.overlay ?? {}) };
}

// Power tables get retuned between releases, so they do not identify hardware.
const isTuningKey = (key: string) => key.startsWith("power_");

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function compareLayouts(device: Layout, candidate: Layout) {
  const keys = [...new Set([...Object.keys(device), ...Object.keys(candidate)])].sort();
  const pinKeys = keys.filter((k) => !isTuningKey(k));
  const samePins = pinKeys.filter((k) => same(device[k], candidate[k]));
  return {
    pinMatch: pinKeys.length ? samePins.length / pinKeys.length : 0,
    fullMatch: keys.length ? keys.filter((k) => same(device[k], candidate[k])).length / keys.length : 0,
    diff: keys
      .filter((k) => !same(device[k], candidate[k]))
      .map((k) => ({ key: k, device: device[k], target: candidate[k], tuning: isTuningKey(k) })),
  };
}

function words(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean),
  );
}

/**
 * Score every target against the trailer. Product names get renamed between
 * releases, so the pin map, which is the hardware itself, weighs the most.
 */
export function matchTargets(db: TargetsDb, trailer: Trailer, chipFamily: string, limit = 5): TargetMatch[] {
  const platforms = PLATFORM_FOR_CHIP.find(([prefix]) => chipFamily.toUpperCase().startsWith(prefix))?.[1];
  const productWords = words(trailer.productName);
  const scored: TargetMatch[] = [];

  for (const entry of db.targets) {
    if (platforms && !platforms.includes(entry.platform ?? "")) continue;
    let score = 0;
    const reasons: string[] = [];

    if (entry.product_name === trailer.productName) {
      score += 100;
      reasons.push("product name");
    }
    const lua = entry.lua_name ?? "";
    if (lua && lua.slice(0, 16) === trailer.deviceName) {
      score += 40;
      reasons.push("lua name");
    }

    let cmp: ReturnType<typeof compareLayouts> | null = null;
    const candidate = trailer.layout ? buildLayout(db, entry) : null;
    if (trailer.layout && candidate) {
      cmp = compareLayouts(trailer.layout, candidate);
      score += 80 * cmp.pinMatch + 25 * cmp.fullMatch;
      if (cmp.pinMatch === 1) {
        reasons.push(cmp.fullMatch === 1 ? "pin map exact" : "pin map exact, power tuning differs");
      } else if (cmp.pinMatch >= 0.9) {
        reasons.push(`pin map ${Math.round(cmp.pinMatch * 100)}%`);
      }
    }

    // Names grow over releases ("DAKEFPV Gemini RX" became "DAKEFPV C3 900/2400
    // Dual Band 100mW Gemini RX"), so containment counts more than Jaccard.
    const entryWords = words(entry.product_name);
    if (productWords.size && entryWords.size) {
      const shared = [...productWords].filter((w) => entryWords.has(w)).length;
      const containment = shared / Math.min(productWords.size, entryWords.size);
      const jaccard = shared / new Set([...productWords, ...entryWords]).size;
      score += 30 * (0.7 * containment + 0.3 * jaccard);
    }

    if (score <= 0) continue;
    scored.push({
      entry,
      score: Math.round(score * 10) / 10,
      reasons,
      pinMatch: cmp?.pinMatch ?? null,
      layoutMatch: cmp?.fullMatch ?? null,
      diff: cmp?.diff ?? null,
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

// POWERMGNT.h PowerLevels_e: power_min/max/default index into this.
export const POWER_LEVEL_MW = ["10 mW", "25 mW", "50 mW", "100 mW", "250 mW", "500 mW", "1 W", "2 W"];

// The PlatformIO env says which radio is fitted; the pin names are the same for every SPI radio.
const RADIO_FROM_ENV: [string, string][] = [
  ["LR1121", "LR1121"],
  ["LR2021", "LR2021"],
  ["SX1272", "SX1272"],
  ["2400", "SX1280"],
  ["900", "SX127x"],
];

export type RadioSummary = {
  count: number;
  chip: string | null;
  chipSource: string | null;
  dualBand: boolean;
  powerMin?: number;
  powerMax?: number;
  powerDefault?: number;
  powerControl?: number;
  powerValues?: unknown;
  powerValues2?: unknown;
  powerValuesDual?: unknown;
  powerHighUnused?: unknown;
  lnaGain?: unknown;
};

export function describeRadio(layout: Layout | null, best: TargetMatch | undefined): RadioSummary | null {
  if (!layout) return null;
  const second = ["radio_nss_2", "radio_busy_2", "radio_dio1_2"].some(
    (k) => layout[k] !== undefined && layout[k] !== null && layout[k] !== -1,
  );
  const env = best?.entry.firmware ?? null;
  const chip = env ? (RADIO_FROM_ENV.find(([token]) => env.toUpperCase().includes(token))?.[1] ?? null) : null;
  const num = (k: string) => (typeof layout[k] === "number" ? (layout[k] as number) : undefined);
  return {
    count: second ? 2 : 1,
    chip,
    chipSource: env,
    dualBand: !!layout.power_values_dual,
    powerMin: num("power_min"),
    powerMax: num("power_max"),
    powerDefault: num("power_default"),
    powerControl: num("power_control"),
    powerValues: layout.power_values,
    powerValues2: layout.power_values2,
    powerValuesDual: layout.power_values_dual,
    // Schema-validated, but hardware.cpp has no field for it, so the firmware ignores it.
    powerHighUnused: layout.power_high,
    lnaGain: layout.power_lna_gain,
  };
}
