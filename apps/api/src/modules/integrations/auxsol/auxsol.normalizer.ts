import { NormalizedMonitoringData, NormalizedStatus } from '../integration.contract';
import { stripSensitiveObject } from '../security.redact';
import { AUXSOL_SUCCESS_CODE } from './auxsol.config';
import { AuxsolInvalidPayloadError } from './auxsol.errors';

export type AuxsolFixtureReading = {
  fixture?: string;
  notOfficialContract?: boolean;
  collectedAt?: string;
  device?: {
    externalDeviceId?: string;
    powerW?: number;
    todayEnergyWh?: number;
    totalEnergyWh?: number;
    statusCode?: string;
    voltageV?: number;
    currentA?: number;
    frequencyHz?: number;
    temperatureC?: number;
  } | null;
};

const STATUS_MAP: Record<string, NormalizedStatus> = {
  running: 'ONLINE',
  online: 'ONLINE',
  offline: 'OFFLINE',
  warning: 'WARNING',
  fault: 'ERROR',
  error: 'ERROR',
};

export function normalizeAuxsolStatus(code?: string): NormalizedStatus {
  if (!code) return 'UNKNOWN';
  return STATUS_MAP[code.toLowerCase()] ?? 'UNKNOWN';
}

/** Conversão usada apenas pelas fixtures internas B7 (W → kW). */
export function wattsToKw(value?: number) {
  if (value === undefined || value === null) return undefined;
  return Number((value / 1000).toFixed(6));
}

/** Conversão usada apenas pelas fixtures internas B7 (Wh → kWh). */
export function wattHoursToKwh(value?: number) {
  if (value === undefined || value === null) return undefined;
  return Number((value / 1000).toFixed(6));
}

export function sanitizeRawPayload(payload: unknown) {
  return stripSensitiveObject(payload);
}

function asFiniteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

/**
 * Parse do timestamp AUXSOL (`dt`).
 * - epoch ms (>1e12) ou segundos
 * - ISO-8601
 * - `YYYY-MM-DD HH:mm:ss` sem timezone → interpretado como UTC (decisão Fase 2)
 * Nunca substitui por Date.now().
 */
export function parseAuxsolTimestamp(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(trimmed)
      ? `${trimmed.replace(' ', 'T')}Z`
      : trimmed;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  return undefined;
}

function hasRealtimeBusinessFields(value: Record<string, unknown>) {
  return value.energyData !== undefined || typeof value.sn === 'string' || value.dt !== undefined;
}

export function isAuxsolOfficialRealtimePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const root = payload as Record<string, unknown>;
  if (root.notOfficialContract === true) return false;
  if (root.device !== undefined) return false;
  if ('data' in root) {
    if (root.data === null) return true;
    if (Array.isArray(root.data)) return true;
    if (root.data && typeof root.data === 'object') {
      return hasRealtimeBusinessFields(root.data as Record<string, unknown>);
    }
    return false;
  }
  return hasRealtimeBusinessFields(root);
}

/**
 * Extrai o objeto de negócio do envelope AUXSOL.
 *
 * Observado na validação real (Sprint 2.1.1):
 * `{ code: "AWX-0000", msg: null, data: null }` → sem inversor (retorna null).
 *
 * Contrato documentado / fixtures:
 * `{ code, msg, data: { sn, dt, energyData, ... } }` → o objeto em data.
 *
 * Lista (`data: []`) sem critério de SN não é selecionada arbitrariamente.
 */
export function extractAuxsolRealtimePayload(
  payload: unknown,
  context?: { serialNumber?: string },
): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') {
    throw new AuxsolInvalidPayloadError('Payload realtime AUXSOL inválido.');
  }
  const root = payload as Record<string, unknown>;
  if ('data' in root) {
    if (typeof root.code === 'string' && root.code !== AUXSOL_SUCCESS_CODE) {
      throw new AuxsolInvalidPayloadError(
        `Resposta realtime AUXSOL rejeitada (code=${root.code}).`,
      );
    }
    if (root.data === null) return null;
    if (Array.isArray(root.data)) {
      return extractRealtimeFromArray(root.data, context?.serialNumber);
    }
    if (!root.data || typeof root.data !== 'object') {
      throw new AuxsolInvalidPayloadError('Payload realtime AUXSOL sem data.');
    }
    return root.data as Record<string, unknown>;
  }
  return hasRealtimeBusinessFields(root) ? root : null;
}

function extractRealtimeFromArray(items: unknown[], serialNumber?: string) {
  if (items.length === 0) return null;
  const objects = items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  const wanted = serialNumber?.trim();
  if (wanted) {
    const matches = objects.filter((item) => typeof item.sn === 'string' && item.sn.trim() === wanted);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      throw new AuxsolInvalidPayloadError('Realtime AUXSOL retornou mais de um objeto para o mesmo SN.');
    }
  }
  throw new AuxsolInvalidPayloadError(
    'Realtime AUXSOL retornou lista sem objeto identificável pelo SN. Nenhum item foi escolhido arbitrariamente.',
  );
}

/**
 * Normaliza o contrato oficial de realtime por SN → NormalizedMonitoringData.
 *
 * Mapeamento Fase 2 (1:1, unidades já em kW / kWh conforme campos do PDF):
 * - energyData.power → powerKw
 * - energyData.y → energyTodayKwh
 * - energyData.ym → energyMonthKwh
 * - energyData.yt → energyTotalKwh
 * - dt → collectedAt (obrigatório)
 *
 * Não inventa status a partir de faultCode/alarmCode.
 */
export function normalizeAuxsolRealtime(
  payload: unknown,
  context?: { inverterId?: string; serialNumber?: string },
): NormalizedMonitoringData[] {
  const data = extractAuxsolRealtimePayload(payload, context);
  if (!data || !Object.keys(data).length) {
    return [];
  }

  const energy = data.energyData && typeof data.energyData === 'object'
    ? (data.energyData as Record<string, unknown>)
    : {};

  const collectedAt = parseAuxsolTimestamp(data.dt);
  if (!collectedAt) {
    throw new AuxsolInvalidPayloadError(
      'Timestamp dt ausente ou inválido no realtime AUXSOL. Date.now() não é usado como substituto.',
    );
  }

  const sn = typeof data.sn === 'string' && data.sn.trim()
    ? data.sn.trim()
    : context?.serialNumber?.trim() || undefined;

  const id = data.id !== undefined && data.id !== null ? String(data.id) : undefined;
  const externalReadingId = id ?? (sn ? `${sn}:${data.dt}` : undefined);

  const powerKw = asFiniteNumber(energy.power);
  const energyTodayKwh = asFiniteNumber(energy.y);
  const energyMonthKwh = asFiniteNumber(energy.ym);
  const energyTotalKwh = asFiniteNumber(energy.yt);

  return [{
    externalPlantId: data.pId !== undefined && data.pId !== null ? String(data.pId) : undefined,
    externalInverterId: sn,
    collectedAt,
    powerKw,
    energyTodayKwh,
    energyMonthKwh,
    energyTotalKwh,
    acPowerKw: powerKw,
    status: 'UNKNOWN',
    communicationOk: true,
    externalReadingId,
    rawPayload: sanitizeRawPayload({
      ...((payload && typeof payload === 'object') ? payload as object : { data }),
      inverterId: context?.inverterId,
    }),
  }];
}

/** Fixtures internas B7 (W/Wh) — preservadas para MOCK. */
export function normalizeAuxsolFixture(payload: AuxsolFixtureReading, inverterId?: string): NormalizedMonitoringData[] {
  if (!payload || payload.device === undefined) {
    throw new AuxsolInvalidPayloadError();
  }
  if (payload.device === null) return [];

  const device = payload.device;
  const collectedAt = payload.collectedAt ? new Date(payload.collectedAt) : undefined;
  if (payload.collectedAt && (!collectedAt || Number.isNaN(collectedAt.getTime()))) {
    throw new AuxsolInvalidPayloadError('Timestamp da fixture AUXSOL inválido.');
  }

  const status = normalizeAuxsolStatus(device.statusCode);
  return [{
    externalInverterId: device.externalDeviceId,
    collectedAt,
    powerKw: wattsToKw(device.powerW),
    energyTodayKwh: wattHoursToKwh(device.todayEnergyWh),
    energyTotalKwh: wattHoursToKwh(device.totalEnergyWh),
    voltage: device.voltageV,
    current: device.currentA,
    frequency: device.frequencyHz,
    temperature: device.temperatureC,
    acPowerKw: wattsToKw(device.powerW),
    status,
    communicationOk: status !== 'OFFLINE' && status !== 'ERROR',
    rawPayload: sanitizeRawPayload({ ...payload, inverterId }),
  }];
}
