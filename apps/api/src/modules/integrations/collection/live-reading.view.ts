/**
 * Snapshot de leitura ao vivo para a interface.
 * Não inventa zero quando o campo está ausente.
 * Não inclui token/secret/raw sensível.
 */
import { parseAuxsolTimestamp } from '../auxsol/auxsol.normalizer';
import { CollectionResult, NormalizedMonitoringData } from '../integration.contract';
import { stripSensitiveObject } from '../security.redact';

export type LiveReadingView = {
  available: boolean;
  unavailableReason: string | null;
  collectedAt: string | null;
  powerKw: number | null;
  energyTodayKwh: number | null;
  energyMonthKwh: number | null;
  energyTotalKwh: number | null;
  communicationOk: boolean | null;
  status: string | null;
  equipmentStatus: string | null;
  lastCommAt: string | null;
  alarms: {
    present: boolean;
    summary: string;
    codes: Record<string, unknown> | null;
  } | null;
  persisted: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function summarizeAlarms(alarmCurrent: unknown): LiveReadingView['alarms'] {
  if (!isRecord(alarmCurrent)) return null;
  const codes = stripSensitiveObject(alarmCurrent) as Record<string, unknown>;
  const numeric = [
    codes.mainFaultCode,
    codes.faultCode,
    codes.mainAlarmCode,
    codes.alarmCode,
    codes.alarmCount,
  ].map(asFiniteNumber);
  const active = numeric.some((value) => value !== null && value !== 0)
    || Boolean(codes.lastAlarm)
    || Boolean(codes.alarmCode0)
    || Boolean(codes.faultCode0);
  return {
    present: active,
    summary: active ? 'Alarmes/falhas reportados pelo fabricante.' : 'Sem alarmes reportados.',
    codes,
  };
}

function extractAuxiliaryFields(rawPayload: unknown): {
  equipmentStatus: string | null;
  lastCommAt: string | null;
  alarms: LiveReadingView['alarms'];
} {
  if (!isRecord(rawPayload)) {
    return { equipmentStatus: null, lastCommAt: null, alarms: null };
  }
  const data = isRecord(rawPayload.data) ? rawPayload.data : rawPayload;
  const equipmentStatus = data.status === undefined || data.status === null
    ? null
    : String(data.status);
  const lastComm = data.lastCommTime ?? data.lastDeviceCommTime ?? null;
  // Mesma política de collectedAt (dt): sem timezone → UTC; com offset → ISO absoluto.
  // Evita exibir lastCommAt 3h à frente de collectedAt só por parse local do browser.
  const parsedLastComm = parseAuxsolTimestamp(lastComm);
  const lastCommAt = parsedLastComm
    ? parsedLastComm.toISOString()
    : (typeof lastComm === 'string' && lastComm.trim() ? lastComm.trim() : null);
  return {
    equipmentStatus,
    lastCommAt,
    alarms: summarizeAlarms(data.alarmCurrent),
  };
}

export function buildLiveReadingView(input: {
  readings: NormalizedMonitoringData[];
  valid: NormalizedMonitoringData[];
  persisted: boolean;
  emptyReason?: string;
}): LiveReadingView {
  if (!input.valid.length) {
    return {
      available: false,
      unavailableReason: input.emptyReason
        || (input.readings.length === 0
          ? 'Fabricante não retornou dados de telemetria para este inversor.'
          : 'Leitura recebida, mas inválida para exibição.'),
      collectedAt: null,
      powerKw: null,
      energyTodayKwh: null,
      energyMonthKwh: null,
      energyTotalKwh: null,
      communicationOk: null,
      status: null,
      equipmentStatus: null,
      lastCommAt: null,
      alarms: null,
      persisted: false,
    };
  }

  const reading = input.valid[0];
  const aux = extractAuxiliaryFields(reading.rawPayload);
  return {
    available: true,
    unavailableReason: null,
    collectedAt: reading.collectedAt?.toISOString() ?? null,
    powerKw: reading.powerKw ?? null,
    energyTodayKwh: reading.energyTodayKwh ?? null,
    energyMonthKwh: reading.energyMonthKwh ?? null,
    energyTotalKwh: reading.energyTotalKwh ?? null,
    communicationOk: typeof reading.communicationOk === 'boolean' ? reading.communicationOk : null,
    status: reading.status ?? null,
    equipmentStatus: aux.equipmentStatus,
    lastCommAt: aux.lastCommAt,
    alarms: aux.alarms,
    persisted: input.persisted,
  };
}

export type CollectionResultWithLive = CollectionResult & {
  liveReading: LiveReadingView | null;
};
