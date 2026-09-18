/**
 * Descoberta read-only AUXSOL (Sprint 2.2).
 * Extrai somente campos presentes. Não inventa valores. Não persiste.
 */

export const AUXSOL_DISCOVERY_TARGET = {
  sn: 'ASN-10SL2508230101',
  model: 'ASN-10SL',
  gateway: 'A012509010791620',
} as const;

export type AuxsolDiscoveryDiagnosis = 'A' | 'B' | 'C' | 'D';

export type AuxsolDiscoveredPlant = {
  plantId: string | number | null;
  plantName: string | null;
  owner: unknown;
  capacity: unknown;
  status: unknown;
  address: unknown;
};

export type AuxsolDiscoveredInverter = {
  inverterId: string | number | null;
  sn: string | null;
  model: unknown;
  ratedPower: unknown;
  gateway: unknown;
  identifiers: Record<string, unknown>;
};

export type AuxsolDiscoveryTargetMatch = {
  found: true;
  plantId: string | number | null;
  plantName: string | null;
  inverterId: string | number | null;
  sn: string;
  model: unknown;
  gateway: unknown;
  identifiers: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstDefined(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key];
    }
  }
  return undefined;
}

function asId(value: unknown): string | number | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function unwrapAuxsolEnvelope(payload: unknown): {
  httpStatus?: number;
  auxsolCode: string | null;
  data: unknown;
  envelopeKeys: string[];
  dataKind: 'null' | 'array' | 'object' | 'string' | 'number' | 'boolean' | 'undefined';
  dataPresent: boolean;
} {
  const root = isRecord(payload) ? payload : null;
  const data = root && 'data' in root ? root.data : payload;
  let dataKind: 'null' | 'array' | 'object' | 'string' | 'number' | 'boolean' | 'undefined' = 'undefined';
  if (data === null) dataKind = 'null';
  else if (Array.isArray(data)) dataKind = 'array';
  else if (typeof data === 'object') dataKind = 'object';
  else if (typeof data === 'string') dataKind = 'string';
  else if (typeof data === 'number') dataKind = 'number';
  else if (typeof data === 'boolean') dataKind = 'boolean';
  const dataPresent = Array.isArray(data)
    ? data.length > 0
    : isRecord(data)
      ? Object.keys(data).length > 0
      : data !== null && data !== undefined;
  return {
    auxsolCode: typeof root?.code === 'string' ? root.code : null,
    data,
    envelopeKeys: root ? Object.keys(root) : [],
    dataKind,
    dataPresent,
  };
}

export function extractAuxsolListItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  for (const key of ['records', 'list', 'rows', 'content', 'items']) {
    if (Array.isArray(data[key])) return data[key] as unknown[];
  }
  return [];
}

export function summarizeAuxsolPlantPage(payload: unknown, pageSize: number) {
  const envelope = unwrapAuxsolEnvelope(payload);
  const items = extractAuxsolListItems(envelope.data);
  const plants = items.filter(isRecord).map(summarizeAuxsolPlant);
  const page = isRecord(envelope.data) ? envelope.data : null;
  const current = Number(page?.current);
  const pages = Number(page?.pages);
  const total = Number(page?.total);
  const hasMore = Number.isFinite(pages) && Number.isFinite(current)
    ? current < pages
    : Number.isFinite(total)
      ? plants.length > 0 && current * pageSize < total
      : items.length >= pageSize && items.length > 0;
  return {
    ...envelope,
    plants,
    count: plants.length,
    current: Number.isFinite(current) ? current : null,
    pages: Number.isFinite(pages) ? pages : null,
    total: Number.isFinite(total) ? total : null,
    hasMore,
  };
}

export function summarizeAuxsolPlant(raw: Record<string, unknown>): AuxsolDiscoveredPlant {
  return {
    plantId: asId(firstDefined(raw, ['plantId', 'pId', 'id'])),
    plantName: asText(firstDefined(raw, ['plantName', 'name'])),
    owner: firstDefined(raw, ['owner', 'ownerName', 'userName']) ?? null,
    capacity: firstDefined(raw, ['capacity', 'installedCapacity', 'totalPower']) ?? null,
    status: firstDefined(raw, ['status', 'plantStatus']) ?? null,
    address: firstDefined(raw, ['address', 'addr']) ?? null,
  };
}

export function summarizeAuxsolInverters(payload: unknown, plantId: string | number | null) {
  const envelope = unwrapAuxsolEnvelope(payload);
  const items = extractAuxsolListItems(envelope.data);
  const inverters = items.filter(isRecord).map(summarizeAuxsolInverter);
  return {
    ...envelope,
    plantId,
    count: inverters.length,
    inverters,
  };
}

export function summarizeAuxsolInverter(raw: Record<string, unknown>): AuxsolDiscoveredInverter {
  const identifiers: Record<string, unknown> = {};
  for (const key of [
    'id', 'inverterId', 'sn', 'serialNumber', 'serial', 'model', 'type',
    'collectorSn', 'collectorSN', 'collector', 'gateway', 'gatewaySn',
    'commSn', 'datalogger', 'dataloggerSn', 'deviceId', 'invId', 'pId', 'plantId',
  ]) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') {
      identifiers[key] = raw[key];
    }
  }
  return {
    inverterId: asId(firstDefined(raw, ['inverterId', 'id', 'invId', 'deviceId'])),
    sn: asText(firstDefined(raw, ['sn', 'serialNumber', 'serial'])),
    model: firstDefined(raw, ['model', 'type', 'inverterModel', 'productModel']) ?? null,
    ratedPower: firstDefined(raw, ['ratedPower', 'nominalPower', 'power']) ?? null,
    gateway: firstDefined(raw, [
      'collectorSn', 'collectorSN', 'gateway', 'gatewaySn', 'commSn',
      'datalogger', 'dataloggerSn', 'collector',
    ]) ?? null,
    identifiers,
  };
}

export function findTargetInverter(
  plants: Array<{ plant: AuxsolDiscoveredPlant; inverters: AuxsolDiscoveredInverter[] }>,
  targetSn = AUXSOL_DISCOVERY_TARGET.sn,
): AuxsolDiscoveryTargetMatch | { found: false; observed: Array<{ sn: string | null; model: unknown }> } {
  for (const entry of plants) {
    for (const inverter of entry.inverters) {
      if (inverter.sn === targetSn) {
        return {
          found: true,
          plantId: entry.plant.plantId,
          plantName: entry.plant.plantName,
          inverterId: inverter.inverterId,
          sn: inverter.sn,
          model: inverter.model,
          gateway: inverter.gateway,
          identifiers: inverter.identifiers,
        };
      }
    }
  }
  return {
    found: false,
    observed: plants.flatMap((entry) => entry.inverters.map((item) => ({
      sn: item.sn,
      model: item.model,
    }))),
  };
}

export function summarizeAuxsolRealtime(payload: unknown) {
  const envelope = unwrapAuxsolEnvelope(payload);
  const dataKeys = isRecord(envelope.data) ? Object.keys(envelope.data) : [];
  return {
    auxsolCode: envelope.auxsolCode,
    dataKind: envelope.dataKind,
    dataPresent: envelope.dataPresent,
    payloadKeys: envelope.envelopeKeys,
    dataKeys,
  };
}

export function classifyAuxsolDiscovery(input: {
  plantCount: number;
  targetFound: boolean;
  realtimeQueried: boolean;
  dataPresent: boolean;
}): AuxsolDiscoveryDiagnosis {
  if (input.plantCount <= 0) return 'A';
  if (!input.targetFound) return 'B';
  if (!input.realtimeQueried || !input.dataPresent) return 'C';
  return 'D';
}

export function diagnosisLabel(code: AuxsolDiscoveryDiagnosis) {
  if (code === 'A') return 'A) AUTENTICAÇÃO OK + PLANTA NÃO ENCONTRADA';
  if (code === 'B') return 'B) AUTENTICAÇÃO OK + PLANTA ENCONTRADA + INVERSOR NÃO ENCONTRADO';
  if (code === 'C') return 'C) AUTENTICAÇÃO OK + INVERSOR ENCONTRADO + TELEMETRIA NULL';
  return 'D) AUTENTICAÇÃO OK + INVERSOR ENCONTRADO + TELEMETRIA REAL';
}
