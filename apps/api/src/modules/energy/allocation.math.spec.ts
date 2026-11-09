import { allocateGenerationKwh, energyToScaled, sumEnergyStrings } from './allocation.math';

describe('allocation.math', () => {
  it('100000 kWh × 40/35/25', () => {
    expect(allocateGenerationKwh(100_000, [40, 35, 25])).toEqual(['40000', '35000', '25000']);
  });

  it('100 kWh × 33.33/33.33/33.34', () => {
    expect(allocateGenerationKwh(100, ['33.33', '33.33', '33.34'])).toEqual(['33.33', '33.33', '33.34']);
  });

  it('soma das alocações = geração', () => {
    const parts = allocateGenerationKwh('12345.678', ['40', '35', '25']);
    expect(sumEnergyStrings(parts)).toBe('12345.678');
  });

  it('rejeita soma ≠ 100%', () => {
    expect(() => allocateGenerationKwh(100, [40, 30, 20])).toThrow('PERCENTAGE_SUM_NOT_100');
  });

  it('rejeita geração negativa', () => {
    expect(() => allocateGenerationKwh(-1, [100])).toThrow('ENERGY_NEGATIVE');
  });

  it('geração zero real aloca zeros', () => {
    expect(allocateGenerationKwh(0, [40, 35, 25])).toEqual(['0', '0', '0']);
    expect(energyToScaled('0')).toBe(0n);
  });
});
