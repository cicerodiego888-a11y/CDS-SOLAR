/**
 * Fixtures INTERNAS da B7 para testes do adapter.
 * Não representam o contrato oficial da AUXSOL.
 * Campo `notOfficialContract` deixa isso explícito.
 */
export const AUXSOL_FIXTURE_VALID = {
  fixture: 'b7-internal-auxsol-fixture',
  notOfficialContract: true,
  collectedAt: '2026-09-05T12:00:00.000Z',
  device: {
    externalDeviceId: 'AUXSOL-DEVICE-001',
    powerW: 1000,
    todayEnergyWh: 2500,
    totalEnergyWh: 180000,
    statusCode: 'running',
    voltageV: 220,
    currentA: 4.5,
    frequencyHz: 60,
  },
};

export const AUXSOL_FIXTURE_EMPTY = {
  fixture: 'b7-internal-auxsol-fixture',
  notOfficialContract: true,
  device: null,
};

export const AUXSOL_FIXTURE_OFFLINE = {
  fixture: 'b7-internal-auxsol-fixture',
  notOfficialContract: true,
  collectedAt: '2026-09-05T12:00:00.000Z',
  device: {
    externalDeviceId: 'AUXSOL-DEVICE-002',
    statusCode: 'offline',
  },
};

export const AUXSOL_FIXTURE_OPTIONAL_MISSING = {
  fixture: 'b7-internal-auxsol-fixture',
  notOfficialContract: true,
  collectedAt: '2026-09-05T15:30:00.000Z',
  device: {
    externalDeviceId: 'AUXSOL-DEVICE-003',
    powerW: 0,
    statusCode: 'running',
  },
};

export const AUXSOL_FIXTURE_INVALID = {
  notOfficialContract: true,
  unexpected: true,
};

/**
 * Fixture de teste alinhada à estrutura do contrato PDF (realtime por SN).
 * Valores fictícios. Sem credenciais/tokens reais.
 * Unidades: power em kW; y/ym/yt em kWh (mapeamento 1:1 → NormalizedMonitoringData).
 */
export const AUXSOL_OFFICIAL_REALTIME_FIXTURE = {
  fixture: 'b7-auxsol-official-realtime-fixture',
  code: 'AWX-0000',
  msg: null,
  data: {
    id: 'rt-001',
    sn: 'TEST-SN-001',
    dt: '2026-09-10 15:30:00',
    pId: 'plant-ext-1',
    lastCommTime: '2026-09-10 15:29:50',
    ratedPower: 5,
    energyData: {
      power: 1.25,
      y: 8.5,
      ym: 120.4,
      yt: 3500.2,
      yy: 3500.2,
    },
    alarmCurrent: {
      faultCode: null,
      alarmCode: null,
      alarmCount: 0,
    },
  },
};

/**
 * Envelope REAL observado na validação AUXSOL 2.1.1 (sanitizado).
 * HTTP 200 + AWX-0000 com data=null. Sem credenciais/tokens.
 */
export const AUXSOL_REALTIME_EMPTY_DATA_FIXTURE = {
  fixture: 'b7-auxsol-realtime-empty-data-observed',
  code: 'AWX-0000',
  msg: null,
  data: null,
};
