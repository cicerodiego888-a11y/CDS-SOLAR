import { buildIdempotencyKey, sanitizeRawPayload, validateNormalizedReading } from './reading.validator';

describe('Validação de leituras normalizadas', () => {
  const base = {
    collectedAt: new Date('2026-09-05T12:00:00.000Z'),
    communicationOk: true,
    powerKw: 1,
    energyTodayKwh: 2,
  };

  it('aceita leitura válida', () => {
    expect(validateNormalizedReading(base)).toBe(true);
  });

  it('rejeita timestamp ausente ou inválido', () => {
    expect(validateNormalizedReading({ communicationOk: true })).toBe(false);
    expect(validateNormalizedReading({ ...base, collectedAt: new Date('invalid') })).toBe(false);
  });

  it('rejeita timestamp muito no futuro e aceita opcionais ausentes', () => {
    const farFuture = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(validateNormalizedReading({ ...base, collectedAt: farFuture })).toBe(false);
    expect(validateNormalizedReading({ collectedAt: base.collectedAt, communicationOk: true })).toBe(true);
  });

  it('não trata potência como energia', () => {
    const reading = { ...base, powerKw: 12.4 };
    expect(reading.energyTotalKwh).toBeUndefined();
    expect(reading.energyTodayKwh).toBe(2);
    expect(validateNormalizedReading(reading)).toBe(true);
  });

  it('remove apiKey do payload bruto, inclusive aninhado', () => {
    expect(sanitizeRawPayload({ apiKey: 'secret', powerKw: 1 })).toEqual({ powerKw: 1 });
    expect(sanitizeRawPayload({ data: { apiKey: 'secret', powerKw: 1 } })).toEqual({ data: { powerKw: 1 } });
  });

  it('rejeita NaN, Infinity e potência negativa', () => {
    expect(validateNormalizedReading({ ...base, powerKw: Number.NaN })).toBe(false);
    expect(validateNormalizedReading({ ...base, energyTodayKwh: Number.POSITIVE_INFINITY })).toBe(false);
    expect(validateNormalizedReading({ ...base, powerKw: -1 })).toBe(false);
  });

  it('gera chave de idempotência estável', () => {
    expect(buildIdempotencyKey('AUXSOL', 'inv-1', { ...base, externalReadingId: 'r1' })).toBe('AUXSOL:inv-1:r1');
    expect(buildIdempotencyKey('AUXSOL', 'inv-1', base)).toBe('AUXSOL:inv-1:2026-09-05T12:00:00.000Z');
  });
});
