export type Band = "433" | "900" | "2400";

export type ModeOption = {
  label: string;
  value: string;
  supportedChips?: string[];
};

export type ModeGroup = {
  label: string;
  options: ModeOption[];
};

export type RangeToolConfig = {
  title: string;
  chipOptions?: string[];
  defaultChip?: string;
  defaultMode: string;
  modeGroups: ModeGroup[];
  sensitivities: Partial<Record<Band, Record<string, number>>>;
  resultBands: Band[];
  defaultByChip?: Record<string, string>;
  powerOptions?: number[];
  txGainOptions?: { label: string; value: number }[];
  rxGainOptions?: { label: string; value: number }[];
  note?: string;
};

export const elrsConfig: RangeToolConfig = {
  title: "ExpressLRS Range Calculator",
  chipOptions: ["SX128X", "SX127X", "LR1121"],
  defaultChip: "SX128X",
  defaultMode: "250Hz_2400",
  defaultByChip: {
    SX128X: "250Hz_2400",
    SX127X: "200Hz_900",
    LR1121: "250Hz_2400",
  },
  resultBands: ["900", "2400"],
  sensitivities: {
    "900": {
      "1000Hz": -103,
      "200Hz": -112,
      "100Hz Full": -112,
      "100Hz": -117,
      "50Hz": -120,
      "25Hz": -123,
      D50: -112,
      X150: -115,
      "X100 Full": -115,
    },
    "2400": {
      F1000: -104,
      F500: -104,
      DK500: -103,
      D500: -104,
      D250: -104,
      "500Hz": -105,
      "333Hz Full": -105,
      "250Hz": -108,
      "150Hz": -112,
      "100Hz Full": -112,
      "50Hz": -115,
      X150: -117.6,
      "X100 Full": -117.6,
    },
  },
  modeGroups: [
    {
      label: "2.4GHz",
      options: [
        { label: "F1000 (2.4GHz)", value: "F1000_2400", supportedChips: ["SX128X"] },
        { label: "F500 (2.4GHz)", value: "F500_2400", supportedChips: ["SX128X"] },
        { label: "DK500 (2.4GHz)", value: "DK500_2400", supportedChips: ["LR1121"] },
        { label: "D500 (2.4GHz)", value: "D500_2400", supportedChips: ["SX128X"] },
        { label: "D250 (2.4GHz)", value: "D250_2400", supportedChips: ["SX128X"] },
        { label: "500Hz (2.4GHz)", value: "500Hz_2400", supportedChips: ["SX128X", "LR1121"] },
        { label: "333Hz Full (2.4GHz)", value: "333Hz Full_2400", supportedChips: ["SX128X", "LR1121"] },
        { label: "250Hz (2.4GHz)", value: "250Hz_2400", supportedChips: ["SX128X", "LR1121"] },
        { label: "150Hz (2.4GHz)", value: "150Hz_2400", supportedChips: ["SX128X", "LR1121"] },
      ],
    },
    {
      label: "900MHz",
      options: [
        { label: "K1000 (900MHz)", value: "1000Hz_900", supportedChips: ["LR1121"] },
        { label: "200Hz (900MHz)", value: "200Hz_900", supportedChips: ["SX127X", "LR1121"] },
        { label: "100Hz (900MHz)", value: "100Hz_900", supportedChips: ["SX127X", "LR1121"] },
        { label: "25Hz (900MHz)", value: "25Hz_900", supportedChips: ["SX127X"] },
        { label: "D50 (900MHz)", value: "D50_900", supportedChips: ["SX127X"] },
      ],
    },
    {
      label: "Common",
      options: [
        { label: "100Hz Full (900MHz/2.4GHz)", value: "100Hz Full_common", supportedChips: ["SX128X", "SX127X", "LR1121"] },
        { label: "50Hz (900MHz/2.4GHz)", value: "50Hz_common", supportedChips: ["SX128X", "SX127X", "LR1121"] },
      ],
    },
    {
      label: "GeminiX",
      options: [
        { label: "150Hz (900MHz+2.4GHz)", value: "X150_gemx", supportedChips: ["LR1121"] },
        { label: "100Hz Full (900MHz+2.4GHz)", value: "X100 Full_gemx", supportedChips: ["LR1121"] },
      ],
    },
  ],
};

export const mlrsConfig: RangeToolConfig = {
  title: "mLRS Range Calculator",
  chipOptions: ["SX128X", "SX127X", "SX126X"],
  defaultChip: "SX128X",
  defaultMode: "50Hz_2400",
  defaultByChip: {
    SX128X: "50Hz_2400",
    SX127X: "31Hz_common",
    SX126X: "31Hz_common",
  },
  resultBands: ["433", "900", "2400"],
  sensitivities: {
    "433": { "50Hz": -106, "31Hz": -108, "19Hz": -112 },
    "900": { "50Hz": -106, "31Hz": -108, "19Hz": -112 },
    "2400": { "111Hz": -104, "50Hz": -105, "31Hz": -108, "19Hz": -112 },
  },
  modeGroups: [
    {
      label: "2.4GHz",
      options: [
        { label: "FLRC 111Hz (2.4GHz)", value: "111Hz_2400", supportedChips: ["SX128X"] },
        { label: "50Hz (2.4GHz)", value: "50Hz_2400", supportedChips: ["SX128X"] },
      ],
    },
    {
      label: "Sub-GHz",
      options: [{ label: "FSK 50Hz (900MHz/433MHz)", value: "50Hz_sub", supportedChips: ["SX126X"] }],
    },
    {
      label: "Common",
      options: [
        { label: "31Hz (2.4GHz/900MHz/433MHz)", value: "31Hz_common", supportedChips: ["SX128X", "SX126X"] },
        { label: "19Hz (2.4GHz/900MHz/433MHz)", value: "19Hz_common", supportedChips: ["SX128X", "SX126X"] },
      ],
    },
  ],
};

export const tbsConfig: RangeToolConfig = {
  title: "TBS Crossfire/Tracer Range Calculator",
  defaultMode: "150Hz_900",
  resultBands: ["900", "2400"],
  note: "Crossfire sensitivity values are based on reverse engineering and can differ from real-world results.",
  sensitivities: {
    "900": {
      "150Hz": -107,
      "50Hz": -116,
      "4Hz": -126,
    },
    "2400": {
      "200Hz": -104,
    },
  },
  modeGroups: [
    {
      label: "Mode",
      options: [
        { label: "Crossfire 150Hz FSK", value: "150Hz_900" },
        { label: "Crossfire 50Hz LoRa", value: "50Hz_900" },
        { label: "Crossfire 4Hz LoRa (Force Telemetry)", value: "4Hz_900" },
      ],
    },
  ],
  rxGainOptions: [{ label: "2.15dBi (Dipole)", value: 2.15 }],
};
