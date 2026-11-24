// The AX12's model, as the handset MCU stores it: a config blob (cfg) and a mixer
// blob (mix). Offsets below are the ones the Radiomaster app and MCU agree on.
//
// cfg:  +0x00 magic 0xA3   +0x39 stick mode   +0x5e 18 curves x 0x22 B
//       +0x2c2 per-source scale, 36 x s8 %
// mix:  u32 total length, tag 0xA4, then per channel a 14 B record followed by
//       that many 8 B mix lines.

export const NSRC = 36;
export const NCH = 16;
export const SRC_6POS = 35;
export const SIX_POS_VALUES = [-500, -300, -100, 100, 300, 500];

const CFG_STICK_MODE = 0x39;
const CFG_CURVES = 0x5e;
const CFG_SCALE = 0x2c2;
const MIX_TAG = 0xa4;
const REC = 14;
const LINE = 8;

export function sourceName(i: number) {
  if (i < 4) return ["Rudder", "Elevator", "Throttle", "Aileron"][i];
  if (i === SRC_6POS) return "6POS";
  if (i < 12) return `P${i - 3}`;
  if (i < 20) return `S${i - 11}`;
  if (i < NSRC) return `S${String.fromCharCode(65 + i - 20)}`;
  return `#${i}`;
}

/** A switch condition byte: bits 5..0 source, 7..6 condition (3 = always). */
export function conditionName(sw: number) {
  const cond = sw >> 6;
  if (cond === 3) return "always";
  const src = sourceName(sw & 0x3f);
  return `${src} ${["low", "mid", "high"][cond]}`;
}

export type MixLine = {
  src: number;
  weight: number; // %
  offset: number; // %
  sw: number;
  curve: number; // 0xff none
  mode: number; // 0 replace, 1 add, 2 multiply
  slow: number; // ms
};

export type Channel = {
  weight: number;
  middle: number;
  min: number;
  max: number;
  curve: number;
  lockSw: number;
  lockVal: number;
  dualRates: { sw: number; weight: number }[];
  lines: MixLine[];
};

const s8 = (v: number) => (v << 24) >> 24;

export const ALWAYS = 0xc0;

export function defaultChannel(lines: MixLine[] = []): Channel {
  return {
    weight: 100,
    middle: 0,
    min: -100,
    max: 100,
    curve: 0xff,
    lockSw: ALWAYS,
    lockVal: 0,
    dualRates: [0, 1, 2].map(() => ({ sw: ALWAYS, weight: 0 })),
    lines,
  };
}

export function simpleLine(src: number, weight = 100, offset = 0): MixLine {
  return { src, weight, offset, sw: ALWAYS, curve: 0xff, mode: 1, slow: 0 };
}

export function parseMix(mix: Uint8Array): Channel[] {
  if (mix.length < 5) throw new Error("The mixer data is too short.");
  const total = (mix[0] | (mix[1] << 8) | (mix[2] << 16) | (mix[3] << 24)) >>> 0;
  if (mix[4] !== MIX_TAG || total < 5 || total > mix.length) throw new Error("The mixer data isn't in a format this page knows.");
  const chans: Channel[] = [];
  let pos = 5;
  while (chans.length < NCH && pos < total) {
    if (pos + REC > total) throw new Error("The mixer data ends partway through a channel.");
    const r = mix.subarray(pos, pos + REC);
    pos += REC;
    const ch: Channel = {
      weight: s8(r[0]),
      middle: s8(r[1]),
      min: s8(r[2]),
      max: s8(r[3]),
      curve: r[4],
      lockSw: r[6],
      lockVal: s8(r[7]),
      dualRates: [0, 1, 2].map((k) => ({ sw: r[8 + 2 * k], weight: s8(r[9 + 2 * k]) })),
      lines: [],
    };
    for (let i = 0; i < r[5]; i++) {
      if (pos + LINE > total) throw new Error("The mixer data ends partway through a mix line.");
      const l = mix.subarray(pos, pos + LINE);
      pos += LINE;
      ch.lines.push({
        src: l[0],
        weight: s8(l[1]),
        offset: s8(l[2]),
        sw: l[3],
        curve: l[4],
        mode: l[5],
        slow: l[6] | (l[7] << 8),
      });
    }
    chans.push(ch);
  }
  return chans;
}

export function buildMix(chans: Channel[]): Uint8Array {
  const out: number[] = [0, 0, 0, 0, MIX_TAG];
  for (const c of chans) {
    if (c.lines.length > 10) throw new Error("A channel can have at most 10 mix lines.");
    out.push(c.weight & 0xff, c.middle & 0xff, c.min & 0xff, c.max & 0xff, c.curve, c.lines.length, c.lockSw, c.lockVal & 0xff);
    for (const d of c.dualRates) out.push(d.sw, d.weight & 0xff);
    for (const l of c.lines) {
      out.push(l.src, l.weight & 0xff, l.offset & 0xff, l.sw, l.curve, l.mode, l.slow & 0xff, (l.slow >> 8) & 0xff);
    }
  }
  const n = out.length;
  out[0] = n & 0xff;
  out[1] = (n >> 8) & 0xff;
  out[2] = (n >> 16) & 0xff;
  out[3] = (n >>> 24) & 0xff;
  return new Uint8Array(out);
}

export const stickMode = (cfg: Uint8Array) => cfg[CFG_STICK_MODE];
export const sourceScale = (cfg: Uint8Array, i: number) => s8(cfg[CFG_SCALE + i] ?? 100);

// ---- mixer, as the MCU runs it (single-precision floats) ----

const f = Math.fround;
const K01 = f(0.01);
const STICK_MODE = [
  [0, 2, 1, 3],
  [0, 1, 2, 3],
  [3, 2, 1, 0],
  [3, 1, 2, 0],
];

export type Inputs = { sources: (number | null)[]; trims: number[] };

function srcValue(cfg: Uint8Array, inp: Inputs, i: number) {
  const raw = inp.sources[i];
  if (raw === null || raw === undefined) return 0xffff;
  let v = Math.trunc((raw * sourceScale(cfg, i)) / 100);
  if (i < 4) {
    let m = stickMode(cfg);
    if (m > 3) m = 0;
    v += Math.trunc((inp.trims[STICK_MODE[m][i]] ?? 0) / 2);
  }
  return v;
}

function switchOn(inp: Inputs, sw: number) {
  const idx = sw & 0x3f;
  const cond = sw >> 6;
  if (cond === 3) return true;
  const raw = inp.sources[idx];
  if (idx >= NSRC || raw === null || raw === undefined) return false;
  if (cond === 2) return raw >= 251;
  if (cond === 0) return raw < -250;
  return raw >= -99 && raw <= 99;
}

const clamp1 = (v: number) => (v > 1 ? 1 : v < -1 ? -1 : v);

function curve(cfg: Uint8Array, c: number, x: number): number {
  if (c === 0xff || c >= 18) return x;
  const base = CFG_CURVES + 0x22 * c;
  const type = cfg[base];
  const n = cfg[base + 1];
  const xs = (i: number) => s8(cfg[base + 2 + i]);
  const ys = (i: number) => s8(cfg[base + 18 + i]);
  const p = xs(0);
  let r = x;
  if (type === 2) {
    const t = f(Math.abs(x));
    const y1 = f(50 - f(0.5 * p));
    // quadratic Bezier through 0, y1, 100
    const y = f(f(f(f(2 * t) * f(1 - t)) * y1) + f(f(t * t) * 100));
    r = f(y * K01);
    if (x < 0) r = -r;
  } else if (type === 1) {
    if (x < 0 && p >= 1) r = f(f((100 - p) * x) * K01);
    else if (x > 0 && p < 0) r = f(f((100 + p) * x) * K01);
  } else if (type === 3) {
    r = [x, Math.max(x, 0), Math.min(x, 0), Math.abs(x), x > 0 ? 1 : 0, x < 0 ? -1 : 0, Math.sign(x)][p] ?? x;
  } else if (type === 4) {
    const xv = f(x * 100);
    for (let i = 0; i + 1 < n && i + 1 < 16; i++) {
      const x0 = xs(i), x1 = xs(i + 1), y0 = ys(i), y1 = ys(i + 1);
      if (xv >= x0 && xv <= x1) {
        let s = f((y1 - y0) / (x1 - x0));
        if (Number.isNaN(s)) s = 0;
        r = f(f(y0 + f(f(xv - x0) * s)) * K01);
      }
    }
  }
  return r;
}

/** Channel output in microseconds (1000..2000), the way the MCU computes it. Ignores "slow". */
export function channelUs(cfg: Uint8Array, ch: Channel, inp: Inputs): number {
  let acc = 0;
  for (const l of ch.lines) {
    let v = f(srcValue(cfg, inp, l.src) / 500);
    v = f(v + f(l.offset * K01));
    v = f(f(l.weight * K01) * v);
    v = curve(cfg, l.curve, clamp1(v));
    const state = Math.trunc(f(v * 10000));
    if (switchOn(inp, l.sw)) {
      const s = f(state / 10000);
      if (l.mode === 0) acc = s;
      else if (l.mode === 1) acc = f(acc + s);
      else if (l.mode === 2) acc = f(acc * s);
    }
    acc = clamp1(acc);
  }
  const mid = f(ch.middle * K01);
  if (acc > 0) acc = f(acc * f(1 - mid));
  if (acc < 0) acc = f(acc * f(1 + mid));
  let o = f(f(ch.weight * K01) * f(acc + mid));
  if (o > 0) o = f(o * f(ch.max * K01));
  if (o < 0) o = f(o * f(ch.min * f(-0.01)));
  o = curve(cfg, ch.curve, o);
  for (const d of ch.dualRates) {
    if (d.sw >> 6 !== 3 && switchOn(inp, d.sw)) {
      o = f(o * f(d.weight * K01));
      break;
    }
  }
  if (ch.lockSw >> 6 !== 3 && switchOn(inp, ch.lockSw)) o = f(ch.lockVal * K01);
  return Math.trunc(f(f(o * 500) + 1500));
}

/** The 11-bit CRSF value the MCU sends to the ELRS module for a channel output. */
export function usToCrsf(us: number) {
  const v = Math.max(0, us - 1000);
  return Math.min(2047, Math.trunc((v * 1638) / 1000) + 173);
}

// ---- ArduPilot flight modes on a 6-position switch ----

/** ArduPilot's CRSF decoder: value * 5 / 8 + 880. */
export const crsfToArduPilotUs = (c: number) => Math.trunc((c * 5) / 8) + 880;

/** ArduPilot's flight-mode switch bands (RC_Channel::read_6pos_switch): 1..6, or 0 if invalid. */
export function arduPilotMode(us: number) {
  if (us <= 900 || us >= 2200) return 0;
  if (us <= 1230) return 1;
  if (us <= 1360) return 2;
  if (us <= 1490) return 3;
  if (us <= 1620) return 4;
  if (us <= 1749) return 5;
  return 6;
}

const EDGES = [900, 1230.5, 1360.5, 1490.5, 1620.5, 1749.5, 2200];
const bandMargin = (us: number) => Math.min(...EDGES.map((e) => Math.abs(us - e)));

const CRSF_MIN = 172;
const CRSF_MAX = 1811;
const crsfToN = (v: number, cnt: number) =>
  v <= CRSF_MIN ? 0 : v >= CRSF_MAX ? cnt - 1 : Math.trunc(((v - CRSF_MIN) * cnt) / (CRSF_MAX - CRSF_MIN + 1));
const nToCrsf = (n: number, max: number) => Math.trunc((n * (CRSF_MAX - CRSF_MIN)) / max) + CRSF_MIN;

/**
 * What the flight controller sees for a CRSF value on CH12 under each ExpressLRS
 * switch mode: CH12 is the 16-position channel in Hybrid, 64 or 128 positions in
 * Wide, and 10-bit in the full-resolution modes.
 */
export const LINK_PATHS: { name: string; via: (c: number) => number }[] = [
  { name: "Full resolution", via: (c) => (c >> 1) << 1 },
  { name: "Hybrid (16-pos)", via: (c) => nToCrsf(crsfToN(c, 16), 15) },
  { name: "Wide (128-pos)", via: (c) => nToCrsf(crsfToN(c, 128), 127) },
  { name: "Wide (64-pos)", via: (c) => nToCrsf(crsfToN(c, 64), 63) },
];

export type SixPosRow = { position: number; us: number; crsf: number; seen: { path: string; us: number; mode: number }[] };

export function sixPosTable(cfg: Uint8Array, ch: Channel): SixPosRow[] {
  return SIX_POS_VALUES.map((raw, k) => {
    const sources = Array<number | null>(NSRC).fill(0);
    sources[SRC_6POS] = raw;
    const us = channelUs(cfg, ch, { sources, trims: [0, 0, 0, 0] });
    const crsf = usToCrsf(us);
    return {
      position: k + 1,
      us,
      crsf,
      seen: LINK_PATHS.map((p) => {
        const apUs = crsfToArduPilotUs(p.via(crsf));
        return { path: p.name, us: apUs, mode: arduPilotMode(apUs) };
      }),
    };
  });
}

/**
 * One 6POS mix line whose weight and offset put each button in its own ArduPilot
 * flight-mode band, picked for the widest margin to a band edge across every
 * ExpressLRS switch mode.
 */
export function arduPilotSixPosChannel(cfg: Uint8Array): { channel: Channel; margin: number } {
  if (sourceScale(cfg, SRC_6POS) <= 0) throw new Error("The model scales the 6POS to zero or below; reset it first.");
  let best: { channel: Channel; margin: number } | null = null;
  for (let w = 1; w <= 100; w++) {
    for (let off = -100; off <= 100; off++) {
      const ch = defaultChannel([simpleLine(SRC_6POS, w, off)]);
      let margin = Infinity;
      for (const row of sixPosTable(cfg, ch)) {
        for (const s of row.seen) {
          margin = s.mode === row.position ? Math.min(margin, bandMargin(s.us)) : -1;
          if (margin < 0) break;
        }
        if (margin < 0 || (best && margin <= best.margin)) break;
      }
      if (margin >= 0 && (!best || margin > best.margin)) best = { channel: ch, margin };
    }
  }
  if (!best) throw new Error("No weight and offset puts all six buttons in separate flight modes.");
  return best;
}
