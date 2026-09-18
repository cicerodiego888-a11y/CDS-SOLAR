/**
 * Descoberta REAL one-shot da AUXSOL (Sprint 2.2).
 * Reutiliza HttpAuxsolTransport + TokenManager existentes.
 * Não persiste, não cria binding, não altera o normalizer.
 * Não imprime APP_SECRET nem access_token.
 */
import { existsSync, readFileSync } from 'node:fs';
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
  AUXSOL_DISCOVERY_TARGET,
  classifyAuxsolDiscovery,
  diagnosisLabel,
  findTargetInverter,
  summarizeAuxsolInverters,
  summarizeAuxsolPlantPage,
  summarizeAuxsolRealtime,
  type AuxsolDiscoveredInverter,
  type AuxsolDiscoveredPlant,
} from '../src/modules/integrations/auxsol/auxsol.discovery';
import {
  AuxsolAuthError,
  AuxsolContractUnavailableError,
  AuxsolInvalidPayloadError,
  AuxsolRequestError,
  AuxsolTransientError,
} from '../src/modules/integrations/auxsol/auxsol.errors';
import { HttpAuxsolTransport } from '../src/modules/integrations/auxsol/auxsol.transport';

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

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

async function main() {
  loadLocalEnv();

  const report: Record<string, unknown> = {
    sprint: 'AUXSOL 2.2 — DISCOVERY',
    persistence: { executed: false },
    migration: { created: false },
    mock: process.env.AUXSOL_MOCK_MODE === 'true' ? 'ON' : 'OFF',
    persist: process.env.AUXSOL_PERSIST_READINGS === 'true' ? 'ON' : 'OFF',
    baseUrlConfigured: Boolean(auxsolOfficialBaseUrl()),
    appIdConfigured: Boolean(auxsolAppId()),
    appSecretConfiguredViaEnv: Boolean(auxsolAppSecret()),
    mode: resolveAuxsolMode(),
    target: {
      sn: AUXSOL_DISCOVERY_TARGET.sn,
      model: AUXSOL_DISCOVERY_TARGET.model,
      gateway: AUXSOL_DISCOVERY_TARGET.gateway,
      found: false,
    },
  };

  if (process.env.AUXSOL_PERSIST_READINGS === 'true') {
    console.error(JSON.stringify({
      ...report,
      status: 'DESCOBERTA BLOQUEADA',
      reason: 'AUXSOL_PERSIST_READINGS deve permanecer false nesta descoberta.',
    }, null, 2));
    process.exitCode = 2;
    return;
  }
  if (process.env.AUXSOL_MOCK_MODE === 'true') {
    console.error(JSON.stringify({
      ...report,
      status: 'DESCOBERTA BLOQUEADA',
      reason: 'AUXSOL_MOCK_MODE=true. A descoberta exige a API real.',
    }, null, 2));
    process.exitCode = 2;
    return;
  }
  if (!auxsolLiveCredentialsConfigured() || resolveAuxsolMode() !== 'live') {
    console.error(JSON.stringify({
      ...report,
      status: 'DESCOBERTA BLOQUEADA',
      reason: 'Configure AUXSOL_API_BASE_URL, AUXSOL_APP_ID e AUXSOL_APP_SECRET em apps/api/.env.',
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
    const transport = new HttpAuxsolTransport();
    const client = new AuxsolClient(transport);
    await client.testConnection();

    const authLog = [...capturedLogs].reverse().find((item) => item.operation === 'auth' && item.status === 'success');
    report.authentication = {
      result: 'OK',
      httpStatus: authLog?.httpStatus ?? null,
      auxsolCode: authLog?.auxsolCode ?? null,
      mode: 'live',
    };

    const plants: AuxsolDiscoveredPlant[] = [];
    let plantHttpStatus: unknown = null;
    let plantCode: unknown = null;
    for (let current = 1; current <= MAX_PAGES; current += 1) {
      const payload = await transport.listPlants({ current, size: PAGE_SIZE });
      const page = summarizeAuxsolPlantPage(payload, PAGE_SIZE);
      const plantLog = [...capturedLogs].reverse().find((item) => (
        item.operation === 'http' && typeof item.endpoint === 'string' && String(item.endpoint).includes('/archive/plant/list')
      ));
      plantHttpStatus = plantLog?.httpStatus ?? plantHttpStatus;
      plantCode = page.auxsolCode ?? plantLog?.auxsolCode ?? plantCode;
      plants.push(...page.plants);
      if (!page.hasMore) break;
    }

    const inventory: Array<{ plant: AuxsolDiscoveredPlant; inverters: AuxsolDiscoveredInverter[] }> = [];
    const plantInverters: Array<Record<string, unknown>> = [];
    for (const plant of plants) {
      if (plant.plantId === null) {
        plantInverters.push({ plantId: null, plantName: plant.plantName, count: 0, inverters: [], note: 'plantId ausente no payload' });
        inventory.push({ plant, inverters: [] });
        continue;
      }
      const payload = await transport.getInvertersByPlant(String(plant.plantId));
      const list = summarizeAuxsolInverters(payload, plant.plantId);
      inventory.push({ plant, inverters: list.inverters });
      plantInverters.push({
        plantId: plant.plantId,
        plantName: plant.plantName,
        httpStatus: [...capturedLogs].reverse().find((item) => (
          item.operation === 'http' && String(item.endpoint).includes('/archive/inverter/getInverterByPlant/')
        ))?.httpStatus ?? null,
        auxsolCode: list.auxsolCode,
        count: list.count,
        inverters: list.inverters.map((item) => ({
          inverterId: item.inverterId,
          sn: item.sn,
          model: item.model,
          ratedPower: item.ratedPower,
          gateway: item.gateway,
          identifiers: item.identifiers,
        })),
      });
    }

    const match = findTargetInverter(inventory);
    report.plants = {
      result: 'OK',
      httpStatus: plantHttpStatus,
      auxsolCode: plantCode,
      count: plants.length,
      items: plants,
    };
    report.inverters = plantInverters;
    report.target = {
      sn: AUXSOL_DISCOVERY_TARGET.sn,
      model: AUXSOL_DISCOVERY_TARGET.model,
      gateway: AUXSOL_DISCOVERY_TARGET.gateway,
      found: match.found,
      ...(match.found
        ? {
          plantId: match.plantId,
          plantName: match.plantName,
          inverterId: match.inverterId,
          inverterSn: match.sn,
          inverterModel: match.model,
          inverterGateway: match.gateway,
          identifiers: match.identifiers,
        }
        : {
          observed: match.observed,
        }),
    };

    let realtimeQueried = false;
    let dataPresent = false;
    if (match.found) {
      const payload = await transport.getInverterRealtimeBySn(match.sn);
      const sanitized = stripSensitiveObject(payload);
      const summary = summarizeAuxsolRealtime(payload);
      const httpLog = [...capturedLogs].reverse().find((item) => (
        item.operation === 'http'
        && typeof item.endpoint === 'string'
        && String(item.endpoint).includes('findInverterRealTimeInfoBySn')
      ));
      realtimeQueried = true;
      dataPresent = summary.dataPresent;
      report.realtime = {
        result: 'OK',
        httpStatus: httpLog?.httpStatus ?? null,
        auxsolCode: summary.auxsolCode ?? httpLog?.auxsolCode ?? null,
        dataKind: summary.dataKind,
        dataPresent,
        payloadKeys: summary.payloadKeys,
        dataKeys: summary.dataKeys,
        comparisonWithPrevious: {
          previous: { auxsolCode: 'AWX-0000', dataKind: 'null', dataPresent: false },
          current: { auxsolCode: summary.auxsolCode, dataKind: summary.dataKind, dataPresent },
          sameNullTelemetry: !dataPresent && summary.dataKind === 'null',
        },
        sanitizedPayload: sanitized,
      };
    } else {
      report.realtime = {
        result: 'SKIPPED',
        note: 'Realtime só é consultado quando o SN alvo aparece na listagem AUXSOL.',
      };
    }

    const dumped = JSON.stringify(capturedLogs);
    report.secretLeakedInLogs = /app_secret|AUXSOL_APP_SECRET/i.test(dumped);
    report.tokenLeakedInLogs = /Bearer\s+\S+/i.test(dumped) || /"access_token"\s*:/i.test(dumped);

    const diagnosis = classifyAuxsolDiscovery({
      plantCount: plants.length,
      targetFound: match.found,
      realtimeQueried,
      dataPresent,
    });
    report.FINAL_STATUS = diagnosisLabel(diagnosis);
    report.note = diagnosis === 'D'
      ? 'Telemetria presente no endpoint realtime. Persistência não executada.'
      : 'Integração de coleta NÃO concluída. Descoberta apenas.';

    originalInfo(JSON.stringify({
      'AUXSOL 2.2 — DISCOVERY': {
        authentication: report.authentication,
        plants: { result: 'OK', count: plants.length, httpStatus: plantHttpStatus, auxsolCode: plantCode },
        target: report.target,
        realtime: report.realtime,
        persistence: { executed: false },
        migration: { created: false },
        FINAL_STATUS: report.FINAL_STATUS,
      },
      detail: report,
    }, null, 2));
  } catch (error) {
    const classified = classifyError(error);
    report.authentication = classified.type === 'AuthError' || classified.type === 'ContractUnavailable'
      ? { result: 'FAIL', ...classified }
      : report.authentication ?? { result: 'OK_OR_UNKNOWN' };
    report.status = classified.type === 'AuthError' || classified.type === 'ContractUnavailable'
      ? 'DESCOBERTA BLOQUEADA'
      : 'FALHA TÉCNICA';
    report.error = classified;
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
