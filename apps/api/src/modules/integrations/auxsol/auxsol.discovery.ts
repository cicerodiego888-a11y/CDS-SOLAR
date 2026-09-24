/**
 * Descoberta AUXSOL (Sprint 4).
 * Extrai somente campos presentes. Não inventa valores.
 * Persistência de binding/leituras é decisão explícita do script de validação.
 */

/** Alvo José — SN do inversor (não confundir com gateway). */
export const AUXSOL_DISCOVERY_TARGET_JOSE = {
  key: 'JOSE',
  label: 'José',
  sn: 'ASN-10SL2508230101',
  model: 'ASN-10SL',
  gateway: 'A012509010791620',
} as const;

/** Alvo Ulisses — SN do inversor (não confundir com gateway). */
export const AUXSOL_DISCOVERY_TARGET_ULISSES = {
  key: 'ULISSES',
  label: 'Ulisses',
  sn: 'ASN-10SL251016000352',
  /** Modelo esperado na AUXSOL Cloud; B7 pode divergir (ASL-10SL) — não sobrescrever. */
  model: 'ASN-10SL',
  gateway: 'A012510191909021',
  b7ModelHint: 'ASL-10SL',
} as const;

export const AUXSOL_DISCOVERY_TARGETS = [
  AUXSOL_DISCOVERY_TARGET_JOSE,
  AUXSOL_DISCOVERY_TARGET_ULISSES,
] as const;

/** Compatibilidade: alvo histórico = José. */
export const AUXSOL_DISCOVERY_TARGET = AUXSOL_DISCOVERY_TARGET_JOSE;

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
  targetSn: string = AUXSOL_DISCOVERY_TARGET.sn,
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

export type AuxsolBindingExternalMetaInput = {
  plantId?: string | number | null;
  inverterId?: string | number | null;
  serialNumber?: string | null;
  model?: unknown;
  gatewayId?: unknown;
};

/**
 * Monta externalMeta somente com campos realmente retornados pela API.
 * Não inventa plantId/inverterId/serial/model/gateway.
 * Nunca inclui credenciais.
 */
export function buildAuxsolBindingExternalMeta(input: AuxsolBindingExternalMetaInput): Record<string, unknown> | null {
  const meta: Record<string, unknown> = {
    provider: 'AUXSOL',
    resourceType: 'INVERTER',
  };
  const plantId = asId(input.plantId ?? null);
  const inverterId = asId(input.inverterId ?? null);
  const serialNumber = asText(input.serialNumber ?? null);
  const model = asText(input.model ?? null);
  const gatewayId = asText(input.gatewayId ?? null);

  if (plantId !== null) meta.plantId = plantId;
  if (inverterId !== null) meta.inverterId = inverterId;
  if (serialNumber) meta.serialNumber = serialNumber;
  if (model) meta.model = model;
  if (gatewayId) meta.gatewayId = gatewayId;

  // Sem identidade oficial do recurso → não há meta útil para binding.
  if (inverterId === null && !serialNumber) return null;
  return meta;
}

/**
 * Identidade primária do recurso Inverter na AUXSOL = inverterId oficial.
 * Serial fica em externalMeta; nunca promove gateway a externalId.
 */
export function resolveAuxsolBindingExternalId(input: {
  inverterId?: string | number | null;
}): string | null {
  const id = asId(input.inverterId ?? null);
  return id === null ? null : String(id);
}

export type DiscoveryTargetReport = {
  customer: string | null;
  plant: string | null;
  b7InverterId: string | null;
  b7EquipmentId: string | null;
  manufacturer: string | null;
  provider: 'AUXSOL';
  providerPlantId: string | number | null;
  providerInverterId: string | number | null;
  providerSerial: string | null;
  providerModel: unknown;
  providerGatewayId: unknown;
  targetFound: boolean;
  bindingCandidate: boolean;
  modelDivergence?: { b7Model: string; auxsolModel: string } | null;
};

/**
 * Preview read-only dos campos confirmados no payload realtime (sem inventar).
 */
export function normalizeAuxsolRealtimePreview(payload: unknown): {
  confirmedFields: string[];
  missingFields: string[];
  units: Record<string, string | 'not_confirmed'>;
} {
  const envelope = unwrapAuxsolEnvelope(payload);
  if (!envelope.dataPresent || !isRecord(envelope.data)) {
    return {
      confirmedFields: [],
      missingFields: ['power', 'y', 'ym', 'yt', 'dt', 'sn'],
      units: {
        power: 'not_confirmed',
        y: 'not_confirmed',
        ym: 'not_confirmed',
        yt: 'not_confirmed',
      },
    };
  }
  const data = envelope.data;
  const energy = isRecord(data.energyData) ? data.energyData : {};
  const candidates = [
    'sn', 'dt', 'ratedPower', 'status', 'alarmCurrent', 'communication', 'pId', 'id',
  ] as const;
  const energyCandidates = ['power', 'y', 'ym', 'yt'] as const;
  const confirmedFields: string[] = [];
  const missingFields: string[] = [];
  for (const key of candidates) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') confirmedFields.push(key);
    else missingFields.push(key);
  }
  for (const key of energyCandidates) {
    if (energy[key] !== undefined && energy[key] !== null && energy[key] !== '') {
      confirmedFields.push(`energyData.${key}`);
    } else {
      missingFields.push(`energyData.${key}`);
    }
  }
  // Unidades: contrato AUXSOL documentado (kW / kWh) quando o campo existe; sem unidade no payload.
  const units: Record<string, string | 'not_confirmed'> = {
    power: confirmedFields.includes('energyData.power') ? 'kW (contrato AUXSOL)' : 'not_confirmed',
    y: confirmedFields.includes('energyData.y') ? 'kWh (contrato AUXSOL)' : 'not_confirmed',
    ym: confirmedFields.includes('energyData.ym') ? 'kWh (contrato AUXSOL)' : 'not_confirmed',
    yt: confirmedFields.includes('energyData.yt') ? 'kWh (contrato AUXSOL)' : 'not_confirmed',
  };
  return { confirmedFields, missingFields, units };
}

export function buildDiscoveryTargetReport(input: {
  label: string;
  match: AuxsolDiscoveryTargetMatch | { found: false; observed: Array<{ sn: string | null; model: unknown }> };
  b7?: {
    customerName?: string | null;
    plantName?: string | null;
    inverterId?: string | null;
    equipmentId?: string | null;
    manufacturer?: string | null;
    model?: string | null;
  } | null;
  b7ModelHint?: string | null;
}): DiscoveryTargetReport {
  if (!input.match.found) {
    return {
      customer: input.b7?.customerName ?? null,
      plant: input.b7?.plantName ?? null,
      b7InverterId: input.b7?.inverterId ?? null,
      b7EquipmentId: input.b7?.equipmentId ?? null,
      manufacturer: input.b7?.manufacturer ?? null,
      provider: 'AUXSOL',
      providerPlantId: null,
      providerInverterId: null,
      providerSerial: null,
      providerModel: null,
      providerGatewayId: null,
      targetFound: false,
      bindingCandidate: false,
      modelDivergence: null,
    };
  }

  const providerInverterId = input.match.inverterId;
  const providerSerial = input.match.sn;
  const bindingCandidate = providerInverterId !== null && providerInverterId !== undefined
    && Boolean(providerSerial);

  const auxsolModel = asText(input.match.model);
  const b7Model = input.b7?.model?.trim() || input.b7ModelHint?.trim() || null;
  const modelDivergence = b7Model && auxsolModel && b7Model !== auxsolModel
    ? { b7Model, auxsolModel }
    : null;

  return {
    customer: input.b7?.customerName ?? null,
    plant: input.b7?.plantName ?? input.match.plantName,
    b7InverterId: input.b7?.inverterId ?? null,
    b7EquipmentId: input.b7?.equipmentId ?? null,
    manufacturer: input.b7?.manufacturer ?? null,
    provider: 'AUXSOL',
    providerPlantId: input.match.plantId,
    providerInverterId,
    providerSerial,
    providerModel: input.match.model,
    providerGatewayId: input.match.gateway,
    targetFound: true,
    bindingCandidate,
    modelDivergence,
  };
}
