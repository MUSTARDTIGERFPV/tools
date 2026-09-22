export function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : digits,
  });
}

export function dbmToMw(dbm: number) {
  return 10 ** (dbm / 10);
}

export function mwToDbm(mw: number) {
  return 10 * Math.log10(mw);
}

export function freeSpacePathLoss(frequencyMhz: number, distanceKm: number) {
  return 20 * Math.log10(frequencyMhz) + 20 * Math.log10(distanceKm) + 32.44;
}

export function estimateRangeKm({
  frequencyMhz,
  txPowerDbm,
  txGainDbi,
  rxGainDbi,
  customGainDb,
  rxSensitivityDbm,
}: {
  frequencyMhz: number;
  txPowerDbm: number;
  txGainDbi: number;
  rxGainDbi: number;
  customGainDb: number;
  rxSensitivityDbm: number;
}) {
  const pathLoss =
    txPowerDbm + txGainDbi + rxGainDbi - rxSensitivityDbm - 32.45 + customGainDb;

  return 10 ** ((pathLoss - 20 * Math.log10(frequencyMhz)) / 20);
}

export function estimateRssiDbm({
  frequencyMhz,
  distanceKm,
  txPowerDbm,
  txGainDbi,
  rxGainDbi,
  customGainDb,
}: {
  frequencyMhz: number;
  distanceKm: number;
  txPowerDbm: number;
  txGainDbi: number;
  rxGainDbi: number;
  customGainDb: number;
}) {
  return txPowerDbm + txGainDbi + rxGainDbi + customGainDb - freeSpacePathLoss(frequencyMhz, distanceKm);
}

export function distanceFactorFromDb(db: number) {
  return 10 ** (db / 20);
}

export function wavelengthMeters(frequencyMhz: number) {
  return 299.792458 / frequencyMhz;
}

export function frequencyMhzFromWavelength(wavelengthM: number) {
  return 299.792458 / wavelengthM;
}

export function beamwidthKm(degrees: number, distanceKm: number) {
  return 2 * distanceKm * Math.tan((degrees * Math.PI) / 360);
}

export function dbmToVoltage(powerDbm: number, impedanceOhms: number) {
  const watts = 10 ** (powerDbm / 10) / 1000;
  const rms = Math.sqrt(watts * impedanceOhms);

  return {
    rms,
    peakToPeak: rms * 2 * Math.sqrt(2),
  };
}

export function scaledRssiToDbm(scaled: number) {
  return scaled * 0.9 - 130;
}

export function dbmToScaledRssi(dbm: number) {
  return Math.max(0, Math.min(100, ((dbm + 130) * 100) / 90));
}
