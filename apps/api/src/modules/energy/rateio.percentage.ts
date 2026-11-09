/**
 * Percentuais de Rateio em escala inteira (4 casas decimais).
 * Evita float binário: 33.33 + 33.33 + 33.34 = 100.0000
 */
const SCALE = 10_000n;
const HUNDRED = 100n * SCALE; // 1_000_000

export function percentageToScaled(value: string | number): bigint {
  const raw = String(value).trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error('PERCENTAGE_INVALID_FORMAT');
  }
  const negative = raw.startsWith('-');
  const [intPart, fracPart = ''] = (negative ? raw.slice(1) : raw).split('.');
  const frac = `${fracPart}0000`.slice(0, 4);
  const scaled = BigInt(intPart || '0') * SCALE + BigInt(frac);
  return negative ? -scaled : scaled;
}

export function scaledToPercentageString(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const intPart = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(4, '0').replace(/0+$/, '');
  const body = frac ? `${intPart}.${frac}` : `${intPart}`;
  return negative ? `-${body}` : body;
}

export function assertPercentageLine(value: string | number) {
  const scaled = percentageToScaled(value);
  if (scaled <= 0n) throw new Error('PERCENTAGE_NON_POSITIVE');
  if (scaled > HUNDRED) throw new Error('PERCENTAGE_GT_100');
  return scaled;
}

export function assertPercentagesSum100(values: Array<string | number>) {
  const total = values.reduce((sum, item) => sum + assertPercentageLine(item), 0n);
  if (total !== HUNDRED) throw new Error('PERCENTAGE_SUM_NOT_100');
  return total;
}

export function intervalsOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null,
) {
  const aEnd = aTo ?? new Date('9999-12-31T23:59:59.999Z');
  const bEnd = bTo ?? new Date('9999-12-31T23:59:59.999Z');
  // semiaberto [from, to)
  return aFrom < bEnd && bFrom < aEnd;
}
