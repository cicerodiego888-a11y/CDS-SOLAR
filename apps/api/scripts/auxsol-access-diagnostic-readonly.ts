/**
 * Diagnóstico SOMENTE LEITURA — APP_ID AUXSOL (acesso plantas/inversores).
 * - POST /auth/token (única mutação HTTP documentada para token)
 * - GET plant list / inverters by plant / realtime by SN
 * - NÃO cria/edita/exclui plantas, bindings, logger, inversores
 * - NÃO imprime APP_SECRET, token ou Bearer
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  auxsolAppId,
  auxsolAppSecret,
  auxsolLiveCredentialsConfigured,
  auxsolOfficialBaseUrl,
  resolveAuxsolMode,
} from '../src/modules/integrations/auxsol/auxsol.config';
import { AuxsolClient } from '../src/modules/integrations/auxsol/auxsol.client';
import {
  AUXSOL_DISCOVERY_TARGET_JOSE,
  AUXSOL_DISCOVERY_TARGET_ULISSES,
  findTargetInverter,
  summarizeAuxsolInverters,
  summarizeAuxsolPlantPage,
  summarizeAuxsolRealtime,
  type AuxsolDiscoveredInverter,
  type AuxsolDiscoveredPlant,
} from '../src/modules/integrations/auxsol/auxsol.discovery';
import { HttpAuxsolTransport } from '../src/modules/integrations/auxsol/auxsol.transport';
import { stripSensitiveObject } from '../src/modules/integrations/security.redact';

const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const TARGETS = [AUXSOL_DISCOVERY_TARGET_JOSE, AUXSOL_DISCOVERY_TARGET_ULISSES] as const;

function loadLocalEnv() {
  const envPath = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/api/.env'),
    resolve(__dirname, '..', '.env'),
  ].find((item) => existsSync(item));
  if (!envPath) throw new Error('apps/api/.env ausente.');
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
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

function latestHttpLog(
  logs: Array<Record<string, unknown>>,
  predicate: (endpoint: string) => boolean,
) {
  return [...logs].reverse().find((item) => (
    item.operation === 'http'
    && typeof item.endpoint === 'string'
    && predicate(String(item.endpoint))
  ));
}

function finalDiagnosis(input: {
  joseFound: boolean;
  ulissesFound: boolean;
  joseData: boolean;
  ulissesData: boolean;
}): 'LIBERADO' | 'PARCIALMENTE LIBERADO' | 'NÃO LOCALIZADO' {
  const foundCount = Number(input.joseFound) + Number(input.ulissesFound);
  if (foundCount === 0) return 'NÃO LOCALIZADO';
  if (foundCount === 2 && input.joseData && input.ulissesData) return 'LIBERADO';
  return 'PARCIALMENTE LIBERADO';
}

async function main() {
  loadLocalEnv();

  const appId = auxsolAppId();
  const report: Record<string, unknown> = {
    sprint: 'VERIFICAÇÃO DE ACESSO AUXSOL — APP_ID 39502',
    scope: 'diagnóstico somente leitura (auth + GET)',
    timestamp: new Date().toISOString(),
    appIdObserved: appId ?? null,
    appIdExpected: '39502',
    appIdMatch: appId === '39502',
    baseUrlConfigured: Boolean(auxsolOfficialBaseUrl()),
    appSecretConfiguredViaEnv: Boolean(auxsolAppSecret()),
    mock: process.env.AUXSOL_MOCK_MODE === 'true' ? 'ON' : 'OFF',
    persist: process.env.AUXSOL_PERSIST_READINGS === 'true' ? 'ON' : 'OFF',
    mode: resolveAuxsolMode(),
    mutationsExecuted: {
      auxsolPostPutPatchDeleteExceptAuth: false,
      plantCreateEditDelete: false,
      loggerBindUnbind: false,
      inverterOrGatewayChange: false,
      localBindingUpsert: false,
      readingPersistence: false,
    },
  };

  if (process.env.AUXSOL_MOCK_MODE === 'true') {
    console.error(JSON.stringify({ ...report, status: 'BLOQUEADO', reason: 'MOCK_MODE' }, null, 2));
    process.exitCode = 2;
    return;
  }
  if (process.env.AUXSOL_PERSIST_READINGS === 'true') {
    console.error(JSON.stringify({ ...report, status: 'BLOQUEADO', reason: 'PERSIST_READINGS_ON' }, null, 2));
    process.exitCode = 2;
    return;
  }
  if (!auxsolLiveCredentialsConfigured() || resolveAuxsolMode() !== 'live') {
    console.error(JSON.stringify({ ...report, status: 'BLOQUEADO', reason: 'CREDENCIAIS_AUSENTES' }, null, 2));
    process.exitCode = 2;
    return;
  }
  if (appId !== '39502') {
    console.error(JSON.stringify({
      ...report,
      status: 'BLOQUEADO',
      reason: 'APP_ID_DIVERGENTE',
      note: 'Sprint exige configuração existente do APP_ID 39502.',
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
      expiresIn: authLog?.expiresIn ?? null,
      mode: 'live',
      note: 'Token obtido; valor do token não é exibido.',
    };

    const plants: AuxsolDiscoveredPlant[] = [];
    let plantHttpStatus: unknown = null;
    let plantCode: unknown = null;
    for (let current = 1; current <= MAX_PAGES; current += 1) {
      const payload = await transport.listPlants({ current, size: PAGE_SIZE });
      const page = summarizeAuxsolPlantPage(payload, PAGE_SIZE);
      const plantLog = latestHttpLog(capturedLogs, (endpoint) => endpoint.includes('/archive/plant/list'));
      plantHttpStatus = plantLog?.httpStatus ?? plantHttpStatus;
      plantCode = page.auxsolCode ?? plantLog?.auxsolCode ?? plantCode;
      plants.push(...page.plants);
      if (!page.hasMore) break;
    }

    const inventory: Array<{ plant: AuxsolDiscoveredPlant; inverters: AuxsolDiscoveredInverter[] }> = [];
    const plantInverters: Array<Record<string, unknown>> = [];
    let inverterHttpEvidence: Array<Record<string, unknown>> = [];

    for (const plant of plants) {
      if (plant.plantId === null) {
        plantInverters.push({
          plantId: null,
          plantName: plant.plantName,
          count: 0,
          inverters: [],
          note: 'plantId ausente no payload',
        });
        inventory.push({ plant, inverters: [] });
        continue;
      }
      const payload = await transport.getInvertersByPlant(String(plant.plantId));
      const list = summarizeAuxsolInverters(payload, plant.plantId);
      const invLog = latestHttpLog(
        capturedLogs,
        (endpoint) => endpoint.includes(`/archive/inverter/getInverterByPlant/${plant.plantId}`),
      );
      inventory.push({ plant, inverters: list.inverters });
      inverterHttpEvidence.push({
        plantId: plant.plantId,
        httpStatus: invLog?.httpStatus ?? null,
        auxsolCode: list.auxsolCode,
      });
      plantInverters.push({
        plantId: plant.plantId,
        plantName: plant.plantName,
        httpStatus: invLog?.httpStatus ?? null,
        auxsolCode: list.auxsolCode,
        count: list.count,
        inverters: list.inverters.map((item) => ({
          inverterId: item.inverterId,
          sn: item.sn,
          model: item.model,
          ratedPower: item.ratedPower,
          gateway: item.gateway,
        })),
      });
    }

    const allInverters = inventory.flatMap((row) => row.inverters);
    const allSerials = allInverters.map((item) => item.sn).filter(Boolean);

    report.plants = {
      httpStatus: plantHttpStatus,
      auxsolCode: plantCode,
      count: plants.length,
      items: plants.map((p) => ({
        plantId: p.plantId,
        plantName: p.plantName,
        capacity: p.capacity,
        status: p.status,
        address: p.address,
      })),
    };
    report.inverters = {
      totalCount: allInverters.length,
      uniqueSerialCount: new Set(allSerials).size,
      httpEvidenceSample: inverterHttpEvidence.slice(0, 5),
      byPlant: plantInverters,
      allSerialsVisible: allSerials,
    };

    const targetResults: Record<string, unknown> = {};
    let joseFound = false;
    let ulissesFound = false;
    let joseData = false;
    let ulissesData = false;

    for (const target of TARGETS) {
      const match = findTargetInverter(inventory, target.sn);
      if (!match.found) {
        targetResults[target.key] = {
          label: target.label,
          sn: target.sn,
          foundInListing: false,
          diagnosis: 'APP_ID não recebeu este SN na listagem',
          realtime: { executed: false, reason: 'SN_AUSENTE_NA_LISTAGEM' },
        };
        continue;
      }

      if (target.key === 'JOSE') joseFound = true;
      if (target.key === 'ULISSES') ulissesFound = true;

      const payload = await transport.getInverterRealtimeBySn(match.sn);
      const summary = summarizeAuxsolRealtime(payload);
      const httpLog = latestHttpLog(
        capturedLogs,
        (endpoint) => endpoint.includes('findInverterRealTimeInfoBySn'),
      );
      const sanitized = stripSensitiveObject(payload) as Record<string, unknown>;
      const data = (sanitized && typeof sanitized === 'object' && 'data' in sanitized)
        ? (sanitized as { data: unknown }).data
        : null;
      const dataRecord = data && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown>
        : null;
      const energy = dataRecord && dataRecord.energyData && typeof dataRecord.energyData === 'object'
        ? dataRecord.energyData as Record<string, unknown>
        : null;

      if (target.key === 'JOSE') joseData = summary.dataPresent;
      if (target.key === 'ULISSES') ulissesData = summary.dataPresent;

      targetResults[target.key] = {
        label: target.label,
        sn: target.sn,
        foundInListing: true,
        identification: {
          plantId: match.plantId,
          plantName: match.plantName,
          inverterId: match.inverterId,
          sn: match.sn,
          model: match.model,
          gateway: match.gateway,
        },
        availability: {
          dataPresent: summary.dataPresent,
          dataKind: summary.dataKind,
          lastCommTime: dataRecord?.lastCommTime ?? null,
          alarmCurrent: dataRecord?.alarmCurrent ?? null,
        },
        generation: {
          power: energy?.power ?? null,
          energyToday: energy?.y ?? null,
          energyMonth: energy?.ym ?? null,
          energyTotal: energy?.yt ?? null,
          dt: dataRecord?.dt ?? null,
          valuesAvailable: Boolean(energy && (
            energy.power != null || energy.y != null || energy.ym != null || energy.yt != null
          )),
        },
        realtime: {
          executed: true,
          httpStatus: httpLog?.httpStatus ?? null,
          auxsolCode: summary.auxsolCode ?? httpLog?.auxsolCode ?? null,
          payloadKeys: summary.payloadKeys,
          dataKeys: summary.dataKeys,
          sanitizedEnvelope: {
            code: (sanitized as { code?: unknown }).code ?? null,
            msg: (sanitized as { msg?: unknown }).msg ?? null,
            dataKind: summary.dataKind,
            dataPresent: summary.dataPresent,
          },
        },
      };
    }

    const diagnosis = finalDiagnosis({ joseFound, ulissesFound, joseData, ulissesData });
    report.targetResults = targetResults;
    report.httpEvidence = {
      authentication: report.authentication,
      plantList: { httpStatus: plantHttpStatus, auxsolCode: plantCode },
      inverterListCalls: inverterHttpEvidence.length,
      inverterListHttpStatuses: [...new Set(inverterHttpEvidence.map((e) => e.httpStatus))],
      inverterListAuxsolCodes: [...new Set(inverterHttpEvidence.map((e) => e.auxsolCode))],
    };
    report.FINAL_DIAGNOSIS = diagnosis;
    report.confirmation = {
      noConfigOrCadastroChanged: true,
      onlyAuthPostAndDocumentedGets: true,
      bindingNotExecuted: true,
      persistenceNotExecuted: true,
    };

    const dumped = JSON.stringify(capturedLogs);
    report.secretLeakedInLogs = /app_secret|AUXSOL_APP_SECRET/i.test(dumped);
    report.tokenLeakedInLogs = /Bearer\s+\S+/i.test(dumped) || /"access_token"\s*:/i.test(dumped);

    const outPath = resolve(__dirname, '..', 'reports', `auxsol-access-diagnostic-${Date.now()}.json`);
    writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    report.reportFile = outPath;

    originalInfo(JSON.stringify(report, null, 2));
  } catch (error) {
    report.status = 'FALHA TÉCNICA';
    report.error = {
      type: error instanceof Error ? error.name : 'unknown',
      message: error instanceof Error ? error.message : String(error),
    };
    originalError(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    status: 'FALHA TÉCNICA',
    message: error instanceof Error ? error.message : 'unknown',
  }, null, 2));
  process.exitCode = 1;
});
