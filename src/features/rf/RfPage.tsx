import { useState } from "react";
import { FieldsetCard } from "@/features/rf/components";
import {
  beamwidthKm,
  dbmToMw,
  dbmToScaledRssi,
  dbmToVoltage,
  distanceFactorFromDb,
  estimateRangeKm,
  estimateRssiDbm,
  formatNumber,
  freeSpacePathLoss,
  frequencyMhzFromWavelength,
  mwToDbm,
  scaledRssiToDbm,
  wavelengthMeters,
} from "@/features/rf/math";
import { NumberField } from "@/components/field";
import { ResultTile } from "@/components/result-tile";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function RfPage() {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-16 lg:px-8">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <PowerCard />
        <FsplCard />
        <RangeCard />
        <RssiCard />
        <InverseSquareCard />
        <WavelengthCard />
        <BeamwidthCard />
        <VoltageCard />
        <RssiTranslationCard />
      </div>
    </section>
  );
}

function PowerCard() {
  const [value, setValue] = useState(20);
  const [inputMw, setInputMw] = useState(false);
  const output = inputMw ? mwToDbm(value) : dbmToMw(value);

  return (
    <FieldsetCard
      title="RF Power"
      description="Convert between logarithmic and linear RF power scales."
    >
      <NumberField id="power" label={`Power (${inputMw ? "mW" : "dBm"})`} value={value} onChange={setValue} />
      <UnitSwitch checked={inputMw} label={inputMw ? "mW input" : "dBm input"} onCheckedChange={setInputMw} />
      <ResultTile
        accent
        className="mt-auto"
        label={`Power output (${inputMw ? "dBm" : "mW"})`}
        value={formatNumber(output)}
      />
    </FieldsetCard>
  );
}

function FsplCard() {
  const [frequencyMhz, setFrequencyMhz] = useState(2450);
  const [distanceKm, setDistanceKm] = useState(10);

  return (
    <FieldsetCard title="Free Space Path Loss" description="Estimate line-of-sight path loss by frequency and distance.">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField id="fspl-frequency" label="Frequency (MHz)" value={frequencyMhz} onChange={setFrequencyMhz} />
        <NumberField id="fspl-distance" label="Distance (km)" value={distanceKm} onChange={setDistanceKm} />
      </div>
      <ResultTile accent className="mt-auto" label="Path loss" value={formatNumber(-freeSpacePathLoss(frequencyMhz, distanceKm))} unit="dB" />
    </FieldsetCard>
  );
}

function RangeCard() {
  const [frequencyMhz, setFrequencyMhz] = useState(2450);
  const [txPowerDbm, setTxPowerDbm] = useState(20);
  const [txGainDbi, setTxGainDbi] = useState(2.15);
  const [rxGainDbi, setRxGainDbi] = useState(2.15);
  const [customGainDb, setCustomGainDb] = useState(0);
  const [rxSensitivityDbm, setRxSensitivityDbm] = useState(-108);
  const rangeKm = estimateRangeKm({
    frequencyMhz,
    txPowerDbm,
    txGainDbi,
    rxGainDbi,
    customGainDb,
    rxSensitivityDbm,
  });

  return (
    <FieldsetCard title="Range Estimator" description="Find theoretical range from link budget parameters.">
      <LinkBudgetFields
        frequencyMhz={frequencyMhz}
        setFrequencyMhz={setFrequencyMhz}
        txPowerDbm={txPowerDbm}
        setTxPowerDbm={setTxPowerDbm}
        txGainDbi={txGainDbi}
        setTxGainDbi={setTxGainDbi}
        rxGainDbi={rxGainDbi}
        setRxGainDbi={setRxGainDbi}
        customGainDb={customGainDb}
        setCustomGainDb={setCustomGainDb}
      />
      <NumberField id="range-sensitivity" label="Rx sensitivity (dBm)" value={rxSensitivityDbm} onChange={setRxSensitivityDbm} />
      <div className="mt-auto grid gap-3 sm:grid-cols-2">
        <ResultTile accent label="Estimated range" value={formatNumber(rangeKm)} unit="km" />
        <ResultTile label="Estimated range" value={formatNumber(rangeKm * 0.621371)} unit="mi" />
      </div>
    </FieldsetCard>
  );
}

function RssiCard() {
  const [frequencyMhz, setFrequencyMhz] = useState(2450);
  const [txPowerDbm, setTxPowerDbm] = useState(20);
  const [txGainDbi, setTxGainDbi] = useState(2.15);
  const [rxGainDbi, setRxGainDbi] = useState(2.15);
  const [customGainDb, setCustomGainDb] = useState(0);
  const [distanceKm, setDistanceKm] = useState(10);

  return (
    <FieldsetCard title="RSSI Estimator" description="Estimate received signal strength at a specific distance.">
      <LinkBudgetFields
        frequencyMhz={frequencyMhz}
        setFrequencyMhz={setFrequencyMhz}
        txPowerDbm={txPowerDbm}
        setTxPowerDbm={setTxPowerDbm}
        txGainDbi={txGainDbi}
        setTxGainDbi={setTxGainDbi}
        rxGainDbi={rxGainDbi}
        setRxGainDbi={setRxGainDbi}
        customGainDb={customGainDb}
        setCustomGainDb={setCustomGainDb}
      />
      <NumberField id="rssi-distance" label="Distance (km)" value={distanceKm} onChange={setDistanceKm} />
      <ResultTile accent className="mt-auto" label="Estimated RSSI" value={formatNumber(estimateRssiDbm({ frequencyMhz, distanceKm, txPowerDbm, txGainDbi, rxGainDbi, customGainDb }))} unit="dBm" />
    </FieldsetCard>
  );
}

function InverseSquareCard() {
  const [gainDb, setGainDb] = useState(6);

  return (
    <FieldsetCard title="Inverse Square Law" description="Translate gain or power changes into distance multiplier.">
      <NumberField id="inverse-square" label="Gain / power increase (dB)" value={gainDb} onChange={setGainDb} />
      <ResultTile accent className="mt-auto" label="Distance factor" value={formatNumber(distanceFactorFromDb(gainDb))} unit="x" />
    </FieldsetCard>
  );
}

function WavelengthCard() {
  const [value, setValue] = useState(2450);
  const [inputMeters, setInputMeters] = useState(false);
  const primary = inputMeters ? frequencyMhzFromWavelength(value) : wavelengthMeters(value);

  return (
    <FieldsetCard title="Wavelength" description="Convert frequency to wavelength or wavelength back to frequency.">
      <NumberField id="wavelength" label={inputMeters ? "Wavelength (m)" : "Frequency (MHz)"} value={value} onChange={setValue} />
      <UnitSwitch checked={inputMeters} label={inputMeters ? "Meters input" : "MHz input"} onCheckedChange={setInputMeters} />
      <div className="mt-auto grid gap-3 sm:grid-cols-2">
        <ResultTile accent label={inputMeters ? "Frequency" : "Wavelength"} value={formatNumber(primary)} unit={inputMeters ? "MHz" : "m"} />
        <ResultTile label={inputMeters ? "Frequency" : "Wavelength"} value={formatNumber(inputMeters ? primary / 1000 : primary * 100)} unit={inputMeters ? "GHz" : "cm"} />
      </div>
    </FieldsetCard>
  );
}

function BeamwidthCard() {
  const [degrees, setDegrees] = useState(24);
  const [distanceKm, setDistanceKm] = useState(25);

  return (
    <FieldsetCard title="Beamwidth" description="Calculate directional antenna beam width at distance.">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField id="beamwidth-degrees" label="Beamwidth (deg)" value={degrees} onChange={setDegrees} />
        <NumberField id="beamwidth-distance" label="Distance (km)" value={distanceKm} onChange={setDistanceKm} />
      </div>
      <ResultTile accent className="mt-auto" label="Beamwidth" value={formatNumber(beamwidthKm(degrees, distanceKm))} unit="km" />
    </FieldsetCard>
  );
}

function VoltageCard() {
  const [powerDbm, setPowerDbm] = useState(20);
  const [impedanceOhms, setImpedanceOhms] = useState(50);
  const voltage = dbmToVoltage(powerDbm, impedanceOhms);

  return (
    <FieldsetCard title="RF Power to Voltage" description="Convert dBm power into voltage for a given RF impedance.">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField id="voltage-power" label="Power (dBm)" value={powerDbm} onChange={setPowerDbm} />
        <NumberField id="voltage-impedance" label="Impedance (ohms)" value={impedanceOhms} onChange={setImpedanceOhms} />
      </div>
      <div className="mt-auto grid gap-3 sm:grid-cols-2">
        <ResultTile accent label="Voltage RMS" value={formatNumber(voltage.rms)} unit="V" />
        <ResultTile label="Voltage p-p" value={formatNumber(voltage.peakToPeak)} unit="V" />
      </div>
    </FieldsetCard>
  );
}

function RssiTranslationCard() {
  const [value, setValue] = useState(20);
  const [inputDbm, setInputDbm] = useState(false);
  const output = inputDbm ? dbmToScaledRssi(value) : scaledRssiToDbm(value);

  return (
    <FieldsetCard title="Scaled RSSI to dBm" description="Translate Betaflight scaled RSSI values and dBm.">
      <NumberField
        id="rssi-translation"
        label={inputDbm ? "RSSI (dBm)" : "RSSI (scaled)"}
        max={inputDbm ? -40 : 100}
        min={inputDbm ? -130 : 0}
        value={value}
        onChange={setValue}
      />
      <UnitSwitch checked={inputDbm} label={inputDbm ? "dBm input" : "Scaled input"} onCheckedChange={setInputDbm} />
      <ResultTile accent className="mt-auto" label={inputDbm ? "RSSI scaled" : "RSSI dBm"} value={formatNumber(output)} />
    </FieldsetCard>
  );
}

type LinkBudgetFieldsProps = {
  frequencyMhz: number;
  setFrequencyMhz: (value: number) => void;
  txPowerDbm: number;
  setTxPowerDbm: (value: number) => void;
  txGainDbi: number;
  setTxGainDbi: (value: number) => void;
  rxGainDbi: number;
  setRxGainDbi: (value: number) => void;
  customGainDb: number;
  setCustomGainDb: (value: number) => void;
};

function LinkBudgetFields(props: LinkBudgetFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <NumberField id="frequency" label="Frequency (MHz)" value={props.frequencyMhz} onChange={props.setFrequencyMhz} />
      <NumberField id="tx-power" label="Tx power (dBm)" value={props.txPowerDbm} onChange={props.setTxPowerDbm} />
      <NumberField id="tx-gain" label="Tx gain (dBi)" value={props.txGainDbi} onChange={props.setTxGainDbi} />
      <NumberField id="rx-gain" label="Rx gain (dBi)" value={props.rxGainDbi} onChange={props.setRxGainDbi} />
      <NumberField id="custom-gain" label="Custom gain / loss (dB)" value={props.customGainDb} onChange={props.setCustomGainDb} />
    </div>
  );
}

function UnitSwitch({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-secondary/35 px-3 py-2">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
