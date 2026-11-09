import {
  assertPercentageLine,
  assertPercentagesSum100,
  intervalsOverlap,
  percentageToScaled,
  scaledToPercentageString,
} from './rateio.percentage';

describe('rateio.percentage', () => {
  it('aceita soma decimal válida 40+35+25', () => {
    expect(assertPercentagesSum100([40, 35, 25])).toBe(1_000_000n);
  });

  it('aceita 33.33+33.33+33.34 = 100', () => {
    expect(assertPercentagesSum100(['33.33', '33.33', '33.34'])).toBe(1_000_000n);
  });

  it('rejeita 99.99', () => {
    expect(() => assertPercentagesSum100(['50', '49.99'])).toThrow('PERCENTAGE_SUM_NOT_100');
  });

  it('rejeita 100.01', () => {
    expect(() => assertPercentagesSum100(['50', '50.01'])).toThrow('PERCENTAGE_SUM_NOT_100');
  });

  it('rejeita percentual negativo ou zero', () => {
    expect(() => assertPercentageLine(0)).toThrow('PERCENTAGE_NON_POSITIVE');
    expect(() => assertPercentageLine(-1)).toThrow('PERCENTAGE_NON_POSITIVE');
  });

  it('rejeita percentual > 100', () => {
    expect(() => assertPercentageLine(100.01)).toThrow('PERCENTAGE_GT_100');
  });

  it('round-trip escala', () => {
    expect(scaledToPercentageString(percentageToScaled('33.34'))).toBe('33.34');
  });

  it('detecta sobreposição e aceita consecutivos', () => {
    const aFrom = new Date('2026-01-01T00:00:00.000Z');
    const aTo = new Date('2026-07-01T00:00:00.000Z');
    const bFrom = new Date('2026-07-01T00:00:00.000Z');
    const bTo = new Date('2027-01-01T00:00:00.000Z');
    const overlapFrom = new Date('2026-06-15T00:00:00.000Z');
    expect(intervalsOverlap(aFrom, aTo, bFrom, bTo)).toBe(false);
    expect(intervalsOverlap(aFrom, aTo, overlapFrom, bTo)).toBe(true);
  });
});
