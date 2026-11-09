import { percentageToScaled, scaledToPercentageString } from './rateio.percentage';

/** Energia em mili-kWh (3 casas decimais). */
const ENERGY_SCALE = 1_000n;
const PCT_DENOM = 1_000_000n; // 10^4 * 100
const HUNDRED_PCT = 1_000_000n; // 100 * 10^4

export function energyToScaled(value: string | number): bigint {
  const raw = String(value).trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new Error('ENERGY_INVALID_FORMAT');
  const negative = raw.startsWith('-');
  const [intPart, fracPart = ''] = (negative ? raw.slice(1) : raw).split('.');
  const frac = `${fracPart}000`.slice(0, 3);
  const scaled = BigInt(intPart || '0') * ENERGY_SCALE + BigInt(frac);
  return negative ? -scaled : scaled;
}

export function scaledToEnergyString(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const intPart = abs / ENERGY_SCALE;
  const frac = (abs % ENERGY_SCALE).toString().padStart(3, '0').replace(/0+$/, '');
  const body = frac ? `${intPart}.${frac}` : `${intPart}`;
  return negative ? `-${body}` : body;
}

/**
 * Aloca geração entre percentuais que somam 100%.
 * Resto de arredondamento (truncamento) vai para a última linha — soma = geração.
 */
export function allocateGenerationKwh(
  generationKwh: string | number,
  percentages: Array<string | number>,
): string[] {
  const gen = energyToScaled(generationKwh);
  if (gen < 0n) throw new Error('ENERGY_NEGATIVE');
  const pcts = percentages.map((item) => percentageToScaled(item));
  const sumPct = pcts.reduce((acc, item) => acc + item, 0n);
  if (sumPct !== HUNDRED_PCT) throw new Error('PERCENTAGE_SUM_NOT_100');

  const floors = pcts.map((pct) => (gen * pct) / PCT_DENOM);
  const allocated = floors.reduce((acc, item) => acc + item, 0n);
  const remainder = gen - allocated;
  if (!floors.length) return [];
  floors[floors.length - 1] += remainder;
  return floors.map(scaledToEnergyString);
}

export function sumEnergyStrings(values: string[]): string {
  const total = values.reduce((acc, item) => acc + energyToScaled(item), 0n);
  return scaledToEnergyString(total);
}

export { scaledToPercentageString };
