/**
 * Validação REAL one-shot da AUXSOL (Sprint 2.1).
 * Usa o Client/Transport/TokenManager/Normalizer existentes.
 * Não persiste MonitoringReading. Não imprime APP_SECRET nem access_token.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripSensitiveObject } from '../src/modules/integrations/security.redact';
import {
  auxsolAppId,
  auxsolAppSecret,
  auxsolLiveCredentialsConfigured,
  auxsolOfficialBaseUrl,
  resolveAuxsolMode,
} from '../src/modules/integrations/auxsol/auxsol.config';
import { AuxsolClient } from '../src/modules/integrations/auxsol/auxsol.client';
import {
  AuxsolAuthError,
  AuxsolContractUnavailableError,
  AuxsolInvalidPayloadError,
  AuxsolRequestError,
  AuxsolTransientError,
} from '../src/modules/integrations/auxsol/auxsol.errors';
import { normalizeAuxsolRealtime } from '../src/modules/integrations/auxsol/auxsol.normalizer';
import { createAuxsolTransport } from '../src/modules/integrations/auxsol/auxsol.transport';

const VALIDATION_SN = 'ASN-10SL2508230101';
const GATEWAY_NOT_SN = 'A012509010791620';

function loadLocalEnv() {
  const envPath = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/api/.env'),
    resolve(__dirname, '..', '.env'),
  ].find((item) => existsSync(item));
  if (!envPath) {
    throw new Error('apps/api/.env ausente. Configure AUXSOL_* localmente.');
  }
  const text = readFileSync(envPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function classifyError(error: unknown): {
  type: string;
  message: string;
  httpStatus?: number;
  auxsolCode?: string;
} {
  if (error instanceof AuxsolAuthError) return { type: 'AuthError', message: error.message };
  if (error instanceof AuxsolTransientError) {
    return { type: 'Transient', message: error.message, httpStatus: error.statusCode };
  }
  if (error instanceof AuxsolRequestError) {
    return { type: 'RequestError', message: error.message, httpStatus: error.statusCode, auxsolCode: error.code };
  }
  if (error instanceof AuxsolContractUnavailableError) {
    return { type: 'ContractUnavailable', message: error.message };
  }
  if (error instanceof AuxsolInvalidPayloadError) {
    return { type: 'InvalidPayload', message: error.message };
  }
  if (error instanceof Error) return { type: error.name || 'Error', message: error.message };
  return { type: 'unknown', message: 'erro desconhecido' };
}

function jsonType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  return typeof value;
}

function inspectTree(
  value: unknown,
  path = '$',
  depth = 0,
  acc: Array<{ path: string; type: string; keys?: string[]; sample?: unknown }> = [],
): Array<{ path: string; type: string; keys?: string[]; sample?: unknown }> {
  if (depth > 8) {
    acc.push({ path, type: 'max-depth' });
    return acc;
  }
  if (Array.isArray(value)) {
    acc.push({ path, type: jsonType(value) });
    if (value.length > 0) inspectTree(value[0], `${path}[0]`, depth + 1, acc);
    return acc;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as object);
    acc.push({ path, type: 'object', keys });
    for (const key of keys) {
      inspectTree((value as Record<string, unknown>)[key], `${path}.${key}`, depth + 1, acc);
    }
    return acc;
  }
  const sample = typeof value === 'string' && value.length > 160 ? `${value.slice(0, 160)}…` : value;
  acc.push({ path, type: jsonType(value), sample });
  return acc;
}

const SEARCH_KEYS = [
  'sn', 'serialNumber', 'serial', 'pId', 'plantId', 'id', 'dt', 'timestamp', 'time',
  'ratedPower', 'type', 'lastCommTime', 'alarmCurrent', 'energyData', 'power', 'y', 'ym', 'yt',
  'energy', 'generation', 'realtime', 'inverter', 'plant', 'data', 'result',
  'batteryData', 'gridData', 'loadData', 'otherData',
];

function findNamedFields(
  value: unknown,
  path = '$',
  acc: Array<{ path: string; type: string; value?: unknown }> = [],
): Array<{ path: string; type: string; value?: unknown }> {
  if (Array.isArray(value)) {
    value.slice(0, 3).forEach((item, index) => findNamedFields(item, `${path}[${index}]`, acc));
    return acc;
  }
  if (!value || typeof value !== 'object') return acc;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const next = `${path}.${key}`;
    if (SEARCH_KEYS.some((name) => name.toLowerCase() === key.toLowerCase())) {
      const primitive = item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean';
      acc.push({
        path: next,
        type: jsonType(item),
        value: primitive ? item : undefined,
      });
    }
    findNamedFields(item, next, acc);
  }
  return acc;
}

function writeDiagnosis(filePath: string, body: unknown) {
  mkdirSync(resolve(filePath, '..'), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

function unwrapData(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.data)) return null;
  if (root.data && typeof root.data === 'object') return root.data as Record<string, unknown>;
  return root;
}

function fieldPresence(data: Record<string, unknown> | null) {
  if (!data) {
    return {
      sn: null,
      pId: null,
      id: null,
      dt: null,
      ratedPower: false,
      type: false,
      lastCommTime: false,
      alarmCurrent: false,
      batteryData: false,
      gridData: false,
      loadData: false,
      otherData: false,
      energyData: null,
    };
  }
  const energy = data.energyData && typeof data.energyData === 'object'
    ? (data.energyData as Record<string, unknown>)
    : undefined;
  return {
    sn: data.sn ?? null,
    pId: data.pId ?? null,
    id: data.id ?? null,
    dt: data.dt ?? null,
    ratedPower: data.ratedPower !== undefined,
    type: data.type !== undefined,
    lastCommTime: data.lastCommTime !== undefined,
    alarmCurrent: data.alarmCurrent !== undefined,
    batteryData: data.batteryData !== undefined,
    gridData: data.gridData !== undefined,
    loadData: data.loadData !== undefined,
    otherData: data.otherData !== undefined,
    energyData: energy
      ? { power: energy.power ?? null, y: energy.y ?? null, ym: energy.ym ?? null, yt: energy.yt ?? null }
      : null,
  };
}

function unitObservation(energy: Record<string, unknown> | null, ratedPower: unknown) {
  if (!energy) return { note: 'energyData ausente — unidades não confirmadas.' };
  const power = typeof energy.power === 'number' ? energy.power : Number(energy.power);
  const rated = typeof ratedPower === 'number' ? ratedPower : Number(ratedPower);
  const notes: string[] = [];
  if (Number.isFinite(power) && Number.isFinite(rated) && rated > 0 && power > rated * 20) {
    notes.push('DOCUMENTAÇÃO vs PAYLOAD: energyData.power parece W (muito acima do ratedPower em kW). Normalizer NÃO alterado.');
  } else if (Number.isFinite(power)) {
    notes.push('energyData.power compatível com kW (mapeamento 1:1 mantido).');
  }
  notes.push('y/ym/yt tratados como kWh (mapeamento 1:1; sem conversão extra).');
  return { power, ratedPower: Number.isFinite(rated) ? rated : null, notes };
}

async function lookupInverterBinding(serialNumber: string) {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({ log: [] });
    try {
      const inverter = await prisma.inverter.findFirst({
        where: { serialNumber },
        include: { manufacturerRef: true, bindings: true },
      });
      if (!inverter) {
        return { found: false as const, note: 'Inversor com este SN ainda não está cadastrado no B7 Solar.' };
      }
      const binding = inverter.bindings.find((item) => item.provider === 'AUXSOL') ?? inverter.bindings[0];
      return {
        found: true as const,
        inverterId: inverter.id,
        manufacturer: inverter.manufacturerRef?.code ?? inverter.manufacturer,
        serialNumber: inverter.serialNumber,
        bindingProvider: binding?.provider ?? null,
        collectEndpoint: `POST /api/integrations/collect/${inverter.id}`,
      };
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    return { found: false as const, note: 'Consulta ao banco indisponível (somente leitura). Binding não verificado.' };
  }
}

async function main() {
  loadLocalEnv();

  const report: Record<string, unknown> = {
    sprint: 'AUXSOL 2.1',
    sn: VALIDATION_SN,
    gatewayNotUsedAsSn: GATEWAY_NOT_SN,
    mock: process.env.AUXSOL_MOCK_MODE === 'true' ? 'ON' : 'OFF',
    persist: process.env.AUXSOL_PERSIST_READINGS === 'true' ? 'ON' : 'OFF',
    baseUrlConfigured: Boolean(auxsolOfficialBaseUrl()),
    appIdConfigured: Boolean(auxsolAppId()),
    appSecretConfiguredViaEnv: Boolean(auxsolAppSecret()),
    mode: resolveAuxsolMode(),
    persistExecuted: false,
    migration: 'NÃO CRIADA',
  };

  report.binding = await lookupInverterBinding(VALIDATION_SN);
  report.collectEndpoint = 'POST /api/integrations/collect/:inverterId (inverterId interno do B7, não o SN).';

  if (process.env.AUXSOL_PERSIST_READINGS === 'true') {
    console.error(JSON.stringify({
      ...report,
      status: 'VALIDAÇÃO REAL BLOQUEADA',
      reason: 'AUXSOL_PERSIST_READINGS deve permanecer false nesta primeira validação.',
    }, null, 2));
    process.exitCode = 2;
    return;
  }
  if (process.env.AUXSOL_MOCK_MODE === 'true') {
    console.error(JSON.stringify({
      ...report,
      status: 'VALIDAÇÃO REAL BLOQUEADA',
      reason: 'AUXSOL_MOCK_MODE=true. A validação real exige mock desativado.',
    }, null, 2));
    process.exitCode = 2;
    return;
  }
  if (!auxsolLiveCredentialsConfigured()) {
    console.error(JSON.stringify({
      ...report,
      status: 'VALIDAÇÃO REAL BLOQUEADA',
      reason: 'Configure AUXSOL_API_BASE_URL, AUXSOL_APP_ID e AUXSOL_APP_SECRET em apps/api/.env (secret somente via env).',
      collectEndpoint: 'POST /api/integrations/collect/:inverterId (inverterId interno do B7, não o SN).',
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const capturedLogs: Array<Record<string, unknown>> = [];
  const originalInfo = console.info;
  const originalError = console.error;
  const capture = (...args: unknown[]) => {
    const first = args[0];
    if (first && typeof first === 'object') capturedLogs.push(first as Record<string, unknown>);
  };
  console.info = ((...args: unknown[]) => {
    capture(...args);
    originalInfo(...args);
  }) as typeof console.info;
  console.error = ((...args: unknown[]) => {
    capture(...args);
    originalError(...args);
  }) as typeof console.error;

  try {
    const transport = createAuxsolTransport();
    if (transport.mode !== 'live') {
      throw new AuxsolContractUnavailableError(`Modo inesperado para validação real: ${transport.mode}`);
    }
    const client = new AuxsolClient(transport);

    await client.testConnection();
    const authLog = [...capturedLogs].reverse().find((item) => item.operation === 'auth' && item.status === 'success');
    report.authentication = {
      result: 'OK',
      httpStatus: authLog?.httpStatus ?? null,
      auxsolCode: authLog?.auxsolCode ?? null,
      authenticated: authLog?.authenticated === true,
      expiresIn: typeof authLog?.expiresIn === 'number' ? authLog.expiresIn : null,
      token_received: true,
    };

    const payload = await client.collect({ serialNumber: VALIDATION_SN });
    const sanitizedPayload = stripSensitiveObject(payload);
    const diagnosisPath = resolve(__dirname, '..', 'tmp', 'auxsol-realtime-diagnosis.json');
    const tree = inspectTree(sanitizedPayload);
    const namedFields = findNamedFields(sanitizedPayload);
    writeDiagnosis(diagnosisPath, {
      capturedAt: new Date().toISOString(),
      snRequested: VALIDATION_SN,
      sanitizedPayload,
      tree,
      namedFields,
    });

    const httpLog = [...capturedLogs].reverse().find((item) => (
      item.operation === 'http' && typeof item.endpoint === 'string' && String(item.endpoint).includes('findInverterRealTimeInfoBySn')
    ));
    const data = unwrapData(payload);
    const presence = fieldPresence(data);
    const energy = presence.energyData;
    const units = unitObservation(energy, data?.ratedPower);

    let normalization: Record<string, unknown> = { result: 'FAIL' };
    try {
      const readings = normalizeAuxsolRealtime(payload, { serialNumber: VALIDATION_SN });
      const reading = readings[0];
      if (!reading) {
        normalization = {
          result: 'EMPTY',
          note: 'Envelope AUXSOL de sucesso sem objeto de inversor. Nenhum campo foi inventado.',
          readings: 0,
        };
      } else {
        normalization = {
          result: 'OK',
          provider: 'AUXSOL',
          sn: reading.externalInverterId ?? null,
          externalPlantId: reading.externalPlantId ?? null,
          externalReadingId: reading.externalReadingId ?? null,
          collectedAt: reading.collectedAt?.toISOString() ?? null,
          powerKw: reading.powerKw ?? null,
          energyTodayKwh: reading.energyTodayKwh ?? null,
          energyMonthKwh: reading.energyMonthKwh ?? null,
          energyTotalKwh: reading.energyTotalKwh ?? null,
          communicationOk: reading.communicationOk ?? null,
          status: reading.status ?? null,
          alarmsPresent: Boolean(data?.alarmCurrent),
        };
      }
    } catch (error) {
      normalization = { result: 'FAIL', ...classifyError(error) };
    }

    const dumped = JSON.stringify(capturedLogs);
    report.secretLeakedInLogs = /app_secret|AUXSOL_APP_SECRET/i.test(dumped);
    report.tokenLeakedInLogs = /Bearer\s+\S+/i.test(dumped) || /"access_token"\s*:/i.test(dumped);
    report.realtime = {
      result: 'OK',
      httpStatus: httpLog?.httpStatus ?? null,
      auxsolCode: httpLog?.auxsolCode ?? null,
      envelopeKeys: httpLog?.envelopeKeys ?? null,
      dataKind: httpLog?.dataKind ?? null,
      endpoint: '/analysis/inverterReport/findInverterRealTimeInfoBySn/{sn}',
      payloadReceived: true,
      payloadType: jsonType(sanitizedPayload),
      expectedPathFields: presence,
      namedFields,
      tree,
      sanitizedPayload,
      diagnosisFile: diagnosisPath,
      units,
    };
    report.normalization = normalization;
    report.binding = await lookupInverterBinding(VALIDATION_SN);
    if (normalization.result === 'EMPTY') {
      report.status = 'CONCLUÍDO COM PENDÊNCIA';
      report.note = 'DADOS REAIS NÃO DISPONÍVEIS NO ENDPOINT. AUXSOL retornou AWX-0000 com data=null.';
    } else {
      report.status = normalization.result === 'OK' ? 'VALIDAÇÃO REAL EXECUTADA' : 'FALHA TÉCNICA';
    }
    originalInfo(JSON.stringify(report, null, 2));
  } catch (error) {
    const classified = classifyError(error);
    report.authentication = classified.type === 'AuthError' || classified.type === 'ContractUnavailable'
      ? { result: 'FAIL', ...classified }
      : report.authentication ?? { result: 'OK_OR_UNKNOWN' };
    if (classified.type !== 'AuthError' && classified.type !== 'ContractUnavailable') {
      report.realtime = { result: 'FAIL', ...classified, payloadReceived: false };
    }
    if (classified.httpStatus === 404 || classified.auxsolCode && String(classified.message).toLowerCase().includes('not found')) {
      report.note = 'B7 Solar não conseguiu localizar o inversor no escopo AUXSOL.';
    }
    report.status = classified.type === 'AuthError' || classified.type === 'ContractUnavailable'
      ? 'VALIDAÇÃO REAL BLOQUEADA'
      : 'FALHA TÉCNICA';
    originalError(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown error';
  console.error(JSON.stringify({
    status: 'FALHA TÉCNICA',
    type: 'bootstrap',
    message,
  }, null, 2));
  process.exitCode = 1;
});
