import { AUXSOL_FIXTURE_OPTIONAL_MISSING, AUXSOL_FIXTURE_VALID, AUXSOL_OFFICIAL_REALTIME_FIXTURE, AUXSOL_REALTIME_EMPTY_DATA_FIXTURE } from './auxsol.fixtures';
import {
  extractAuxsolRealtimePayload,
  normalizeAuxsolFixture,
  normalizeAuxsolRealtime,
  normalizeAuxsolStatus,
  parseAuxsolTimestamp,
  wattHoursToKwh,
  wattsToKw,
} from './auxsol.normalizer';
import { AuxsolInvalidPayloadError } from './auxsol.errors';

describe('Normalização AUXSOL (fixtures internas)', () => {
  it('converte 1000 W em 1 kW quando a fixture documenta W', () => {
    expect(wattsToKw(1000)).toBe(1);
    expect(wattHoursToKwh(2500)).toBe(2.5);
  });

  it('mapeia status do fabricante para o enum interno', () => {
    expect(normalizeAuxsolStatus('running')).toBe('ONLINE');
    expect(normalizeAuxsolStatus('offline')).toBe('OFFLINE');
    expect(normalizeAuxsolStatus('warning')).toBe('WARNING');
    expect(normalizeAuxsolStatus('fault')).toBe('ERROR');
    expect(normalizeAuxsolStatus('desconhecido')).toBe('UNKNOWN');
    expect(normalizeAuxsolStatus()).toBe('UNKNOWN');
  });

  it('normaliza leitura válida sem inventar campos', () => {
    const [reading] = normalizeAuxsolFixture(AUXSOL_FIXTURE_VALID, 'inv-1');
    expect(reading.externalInverterId).toBe('AUXSOL-DEVICE-001');
    expect(reading.powerKw).toBe(1);
    expect(reading.energyTodayKwh).toBe(2.5);
    expect(reading.energyTotalKwh).toBe(180);
    expect(reading.status).toBe('ONLINE');
    expect(reading.collectedAt?.toISOString()).toBe('2026-09-05T12:00:00.000Z');
    expect(reading.temperature).toBeUndefined();
  });

  it('mantém campos opcionais ausentes como indefinidos', () => {
    const [reading] = normalizeAuxsolFixture(AUXSOL_FIXTURE_OPTIONAL_MISSING);
    expect(reading.energyTodayKwh).toBeUndefined();
    expect(reading.voltage).toBeUndefined();
    expect(reading.temperature).toBeUndefined();
  });

  it('rejeita payload inválido', () => {
    expect(() => normalizeAuxsolFixture({} as never)).toThrow(AuxsolInvalidPayloadError);
  });
});

describe('Normalização AUXSOL (contrato oficial realtime)', () => {
  it('mapeia energyData.power/y/ym/yt sem conversão inventada', () => {
    const [reading] = normalizeAuxsolRealtime(AUXSOL_OFFICIAL_REALTIME_FIXTURE, {
      inverterId: 'inv-1',
      serialNumber: 'TEST-SN-001',
    });
    expect(reading.powerKw).toBe(1.25);
    expect(reading.energyTodayKwh).toBe(8.5);
    expect(reading.energyMonthKwh).toBe(120.4);
    expect(reading.energyTotalKwh).toBe(3500.2);
    expect(reading.acPowerKw).toBe(1.25);
    expect(reading.externalInverterId).toBe('TEST-SN-001');
    expect(reading.externalPlantId).toBe('plant-ext-1');
    expect(reading.externalReadingId).toBe('rt-001');
    expect(reading.communicationOk).toBe(true);
    expect(reading.status).toBe('UNKNOWN');
  });

  it('usa dt do payload como collectedAt (UTC quando sem timezone)', () => {
    const [reading] = normalizeAuxsolRealtime(AUXSOL_OFFICIAL_REALTIME_FIXTURE);
    expect(reading.collectedAt?.toISOString()).toBe('2026-09-10T15:30:00.000Z');
  });

  it('parseia dt em epoch e ISO', () => {
    const ms = Date.parse('2024-09-10T18:10:00.000Z');
    expect(parseAuxsolTimestamp(ms)?.toISOString()).toBe('2024-09-10T18:10:00.000Z');
    expect(parseAuxsolTimestamp(Math.floor(ms / 1000))?.toISOString()).toBe('2024-09-10T18:10:00.000Z');
    expect(parseAuxsolTimestamp('2026-09-10T15:30:00.000Z')?.toISOString()).toBe('2026-09-10T15:30:00.000Z');
  });

  it('rejeita ausência de dt sem usar Date.now()', () => {
    expect(() => normalizeAuxsolRealtime({
      code: 'AWX-0000',
      data: { sn: 'X', energyData: { power: 1 } },
    })).toThrow(/dt ausente|Timestamp/);
  });

  it('rejeita code diferente de AWX-0000', () => {
    expect(() => normalizeAuxsolRealtime({
      code: 'AWX-9999',
      data: { sn: 'X', dt: '2026-09-10 15:30:00', energyData: {} },
    })).toThrow(AuxsolInvalidPayloadError);
  });

  it('preserva rawPayload sem inventar potência a partir do tempo', () => {
    const [reading] = normalizeAuxsolRealtime(AUXSOL_OFFICIAL_REALTIME_FIXTURE);
    expect(reading.rawPayload).toMatchObject({
      code: 'AWX-0000',
      data: { sn: 'TEST-SN-001' },
    });
    expect(JSON.stringify(reading.rawPayload)).not.toMatch(/access_token|Bearer|app_secret/i);
  });

  it('retorna lista vazia quando data é null', () => {
    expect(normalizeAuxsolRealtime({ code: 'AWX-0000', data: null })).toEqual([]);
    expect(normalizeAuxsolRealtime(AUXSOL_REALTIME_EMPTY_DATA_FIXTURE)).toEqual([]);
    expect(extractAuxsolRealtimePayload(AUXSOL_REALTIME_EMPTY_DATA_FIXTURE)).toBeNull();
  });

  it('não escolhe arbitrariamente o primeiro item se data for lista', () => {
    expect(() => extractAuxsolRealtimePayload({
      code: 'AWX-0000',
      data: [{ sn: 'OTHER', dt: '2026-09-10 15:30:00' }],
    }, { serialNumber: 'ASN-10SL2508230101' })).toThrow(/lista sem objeto identificável/);
  });

  it('extrai da lista somente o objeto cujo sn coincide', () => {
    const extracted = extractAuxsolRealtimePayload({
      code: 'AWX-0000',
      data: [
        { sn: 'OTHER', dt: '2026-09-10 15:30:00' },
        { sn: 'ASN-10SL2508230101', dt: '2026-09-10 15:31:00', energyData: { power: 2 } },
      ],
    }, { serialNumber: 'ASN-10SL2508230101' });
    expect(extracted).toMatchObject({ sn: 'ASN-10SL2508230101', energyData: { power: 2 } });
  });
});
