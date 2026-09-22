import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { NumberField } from "@/components/field";
import { ResultTile } from "@/components/result-tile";
import { ToolPage } from "@/components/tool-page";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { estimateRangeKm, formatNumber, mwToDbm } from "@/features/rf/math";
import type { Band, RangeToolConfig } from "@/features/range/range-data";

const defaultPowers = [10, 25, 50, 100, 250, 500, 1000];
const defaultTxGains = [
  { label: "2.15dBi (Dipole)", value: 2.15 },
  { label: "5dBi (Moxon)", value: 5 },
];
const defaultRxGains = [
  { label: "2.15dBi (Dipole)", value: 2.15 },
  { label: "2.15dBi + 8dB (Dipole + LNA)", value: 10.15 },
];

const bandFrequencyMhz: Record<Band, number> = {
  "433": 433,
  "900": 900,
  "2400": 2450,
};

const bandLabels: Record<Band, string> = {
  "433": "433MHz Range",
  "900": "900MHz Range",
  "2400": "2.4GHz Range",
};

type RangePageProps = {
  config: RangeToolConfig;
};

export function RangePage({ config }: RangePageProps) {
  const [chip, setChip] = useState(config.defaultChip ?? config.chipOptions?.[0] ?? "");
  const [mode, setMode] = useState(config.defaultMode);
  const [powerMw, setPowerMw] = useState(100);
  const [txGain, setTxGain] = useState(2.15);
  const [rxGain, setRxGain] = useState(2.15);
  const [margin, setMargin] = useState(0);

  const modeKey = mode.split("_")[0];
  const modeBand = mode.split("_")[1];
  const txPowerDbm = mwToDbm(powerMw);

  const results = useMemo(() => {
    return config.resultBands.map((band) => {
      const sensitivity = config.sensitivities[band]?.[modeKey];
      const applies =
        modeBand === "common" ||
        modeBand === "gemx" ||
        modeBand === "sub" ||
        modeBand === band;

      if (!applies || sensitivity === undefined) {
        return { band, value: "N/A" };
      }

      const rangeKm = estimateRangeKm({
        frequencyMhz: bandFrequencyMhz[band],
        txPowerDbm,
        txGainDbi: txGain,
        rxGainDbi: rxGain,
        customGainDb: margin,
        rxSensitivityDbm: sensitivity,
      });

      return { band, value: formatNumber(rangeKm), unit: "km" };
    });
  }, [config.resultBands, config.sensitivities, margin, modeBand, modeKey, rxGain, txGain, txPowerDbm]);

  function onChipChange(value: string) {
    setChip(value);
    const selected = findMode(config, mode);
    if (selected?.supportedChips && !selected.supportedChips.includes(value)) {
      setMode(config.defaultByChip?.[value] ?? config.defaultMode);
    }
  }

  return (
    <ToolPage
      title={config.title}
      note={
        config.note ??
        "Range is calculated with the Friis transmission equation and assumes free-space propagation."
      }
      noteLabel="Model"
    >
      <Card className="mx-auto max-w-3xl">
        <CardHeader>
          <CardTitle>Link inputs</CardTitle>
          <CardDescription>
            Use custom gain/loss for margin, polarization loss, shadowing, or antenna system losses.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-[32rem] flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {config.chipOptions ? (
              <SelectField label="Transceiver" value={chip} onChange={onChipChange}>
                {config.chipOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
            ) : null}

            <SelectField label="Packet rate / mode" value={mode} onChange={setMode}>
              {config.modeGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option
                      disabled={option.supportedChips ? !option.supportedChips.includes(chip) : false}
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectField>

            <SelectField label="Power level" value={String(powerMw)} onChange={(value) => setPowerMw(Number(value))}>
              {(config.powerOptions ?? defaultPowers).map((option) => (
                <option key={option} value={option}>
                  {option}mW
                </option>
              ))}
            </SelectField>

            <SelectField label="TX antenna gain" value={String(txGain)} onChange={(value) => setTxGain(Number(value))}>
              {(config.txGainOptions ?? defaultTxGains).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>

            <SelectField label="RX antenna gain" value={String(rxGain)} onChange={(value) => setRxGain(Number(value))}>
              {(config.rxGainOptions ?? defaultRxGains).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>

            <NumberField id="range-margin" label="Custom gain / loss (dB)" value={margin} onChange={setMargin} />
          </div>

          <div className="mt-auto grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((result, index) => (
              <ResultTile
                accent={index === 0}
                key={result.band}
                label={bandLabels[result.band]}
                unit={result.unit}
                value={result.value}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </ToolPage>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </Select>
    </div>
  );
}

function findMode(config: RangeToolConfig, mode: string) {
  return config.modeGroups.flatMap((group) => group.options).find((option) => option.value === mode);
}
