/**
 * Descoberta REAL one-shot da AUXSOL (Sprint 4).
 * Reutiliza HttpAuxsolTransport + TokenManager existentes.
 * Não inventa IDs. Não trata gateway como inversor.
 * Binding só quando TARGET_FOUND + inverterId oficial + match B7 por serial.
 * Leituras NÃO são persistidas (AUXSOL_PERSIST_READINGS deve permanecer false).
 * Não imprime APP_SECRET nem access_token.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';
import { stripSensitiveObject } from '../src/modules/integrations/security.redact';
import {
  assertBindingPayloadHasNoSecrets,
} from '../src/modules/integrations/integration-binding.identity';
import {
  auxsolAppId,
  auxsolAppSecret,
  auxsolLiveCredentialsConfigured,
  auxsolOfficialBaseUrl,
  resolveAuxsolMode,
} from '../src/modules/integrations/auxsol/auxsol.config';
import { AuxsolClient } from '../src/modules/integrations/auxsol/auxsol.client';
import {
  AUXSOL_DISCOVERY_TARGETS,
  buildAuxsolBindingExternalMeta,
  buildDiscoveryTargetReport,
  classifyAuxsolDiscovery,
  diagnosisLabel,
  findTargetInverter,
  normalizeAuxsolRealtimePreview,
  resolveAuxsolBindingExternalId,
  summarizeAuxsolInverters,
  summarizeAuxsolPlantPage,
  summarizeAuxsolRealtime,
  type AuxsolDiscoveredInverter,
  type AuxsolDiscoveredPlant,
  type DiscoveryTargetReport,
} from '../src/modules/integrations/auxsol/auxsol.discovery';
import {
  AuxsolAuthError,
  AuxsolContractUnavailableError,
  AuxsolInvalidPayloadError,
  AuxsolRequestError,
  AuxsolTransientError,
} from '../src/modules/integrations/auxsol/auxsol.errors';
import { normalizeAuxsolRealtime } from '../src/modules/integrations/auxsol/auxsol.normalizer';
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

async function lookupB7BySerial(prisma: PrismaClient, sn: string, gateway?: string) {
  const inverter = await prisma.inverter.findFirst({
    where: { serialNumber: sn },
    include: {
      plant: { include: { customer: true } },
      manufacturerRef: true,
      equipment: {
        where: gateway
          ? { OR: [{ serialNumber: gateway }, { type: { in: ['GATEWAY', 'DATALOGGER'] } }] }
          : { type: { in: ['GATEWAY', 'DATALOGGER'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });
  if (!inverter) return null;
  const equipment = gateway
    ? inverter.equipment.find((item) => item.serialNumber === gateway) ?? inverter.equipment[0] ?? null
    : inverter.equipment[0] ?? null;
  return {
    customerName: inverter.plant.customer?.name ?? null,
    plantName: inverter.plant.name,
    inverterId: inverter.id,
    equipmentId: equipment?.id ?? null,
    manufacturer: inverter.manufacturerRef?.code ?? inverter.manufacturer ?? null,
    model: inverter.model,
  };
}

type BindingUpsertResult = {
  created: boolean;
  updated: boolean;
  bindingCreated: boolean;
  reason?: string;
  bindingId?: string;
  externalId?: string | null;
  externalMeta?: unknown;
  targetKey?: string;
};

async function upsertBindingIfEligible(prisma: PrismaClient, input: {
  report: DiscoveryTargetReport;
  targetKey: string;
}): Promise<BindingUpsertResult> {
  if (!input.report.targetFound || !input.report.bindingCandidate) {
    return { created: false, updated: false, bindingCreated: false, reason: 'TARGET_NOT_FOUND_OR_NO_IDS' };
  }
  if (!input.report.b7InverterId) {
    return { created: false, updated: false, bindingCreated: false, reason: 'B7_INVERTER_NOT_MATCHED' };
  }
  const externalId = resolveAuxsolBindingExternalId({
    inverterId: input.report.providerInverterId,
  });
  if (!externalId) {
    return { created: false, updated: false, bindingCreated: false, reason: 'PROVIDER_INVERTER_ID_ABSENT' };
  }
  const externalMeta = buildAuxsolBindingExternalMeta({
    plantId: input.report.providerPlantId,
    inverterId: input.report.providerInverterId,
    serialNumber: input.report.providerSerial,
    model: input.report.providerModel,
    gatewayId: input.report.providerGatewayId,
  });
  if (!externalMeta || !assertBindingPayloadHasNoSecrets(externalMeta)) {
    return { created: false, updated: false, bindingCreated: false, reason: 'EXTERNAL_META_INVALID' };
  }

  const existing = await prisma.integrationBinding.findUnique({
    where: {
      inverterId_provider: {
        inverterId: input.report.b7InverterId,
        provider: 'AUXSOL',
      },
    },
  });

  const binding = existing
    ? await prisma.integrationBinding.update({
      where: { id: existing.id },
      data: {
        externalId,
        externalMeta: externalMeta as Prisma.InputJsonValue,
        status: 'READY',
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    })
    : await prisma.integrationBinding.create({
      data: {
        provider: 'AUXSOL',
        inverterId: input.report.b7InverterId,
        externalId,
        externalMeta: externalMeta as Prisma.InputJsonValue,
        status: 'READY',
      },
    });

  return {
    created: !existing,
    updated: Boolean(existing),
    bindingCreated: true,
    bindingId: binding.id,
    externalId: binding.externalId,
    externalMeta: binding.externalMeta,
    targetKey: input.targetKey,
  };
}

async function main() {
  loadLocalEnv();

  const report: Record<string, unknown> = {
    sprint: 'SPRINT 4 — AUXSOL REAL',
    persistence: { executed: false, reason: 'AUXSOL_PERSIST_READINGS=false (somente payload real válido autorizaria)' },
    migration: { created: false },
    mock: process.env.AUXSOL_MOCK_MODE === 'true' ? 'ON' : 'OFF',
    persist: process.env.AUXSOL_PERSIST_READINGS === 'true' ? 'ON' : 'OFF',
    baseUrlConfigured: Boolean(auxsolOfficialBaseUrl()),
    appIdConfigured: Boolean(auxsolAppId()),
    appSecretConfiguredViaEnv: Boolean(auxsolAppSecret()),
    mode: resolveAuxsolMode(),
    targets: AUXSOL_DISCOVERY_TARGETS.map((t) => ({
      key: t.key,
      sn: t.sn,
      model: t.model,
      gateway: t.gateway,
    })),
  };

  if (process.env.AUXSOL_PERSIST_READINGS === 'true') {
    console.error(JSON.stringify({
      ...report,
      status: 'DESCOBERTA BLOQUEADA',
      reason: 'AUXSOL_PERSIST_READINGS deve permanecer false nesta descoberta (persistência seletiva só após payload real validado).',
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

  const prisma = new PrismaClient();

  try {
    const transport = new HttpAuxsolTransport();
    const client = new AuxsolClient(transport);
    await client.testConnection();

    const authLog = [...capturedLogs].reverse().find((item) => item.operation === 'auth' && item.status === 'success');
    report.authentication = {
      result: 'OK',
      status: 'AUTHENTICATED',
      httpStatus: authLog?.httpStatus ?? null,
      auxsolCode: authLog?.auxsolCode ?? null,
      expiresIn: authLog?.expiresIn ?? null,
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

    report.plants = {
      result: 'OK',
      status: 'DISCOVERY_OK',
      httpStatus: plantHttpStatus,
      auxsolCode: plantCode,
      count: plants.length,
      items: plants,
    };
    report.inverters = plantInverters;

    const discoveryResults: Record<string, DiscoveryTargetReport> = {};
    const realtimeByTarget: Record<string, unknown> = {};
    const normalizationByTarget: Record<string, unknown> = {};
    const bindingByTarget: Record<string, unknown> = {};
    let anyTargetFound = false;
    let anyRealtimeData = false;

    for (const target of AUXSOL_DISCOVERY_TARGETS) {
      const match = findTargetInverter(inventory, target.sn);
      const b7 = await lookupB7BySerial(prisma, target.sn, target.gateway).catch(() => null);
      const targetReport = buildDiscoveryTargetReport({
        label: target.label,
        match,
        b7,
        b7ModelHint: 'b7ModelHint' in target ? target.b7ModelHint : null,
      });
      discoveryResults[target.key] = targetReport;
      anyTargetFound = anyTargetFound || targetReport.targetFound;

      if (!match.found) {
        realtimeByTarget[target.key] = {
          result: 'SKIPPED',
          status: 'TARGET_NOT_FOUND',
          note: 'Realtime só é consultado quando o SN alvo aparece na listagem AUXSOL.',
        };
        bindingByTarget[target.key] = {
          bindingCreated: false,
          reason: 'TARGET_NOT_FOUND',
        };
        continue;
      }

      const payload = await transport.getInverterRealtimeBySn(match.sn);
      const sanitized = stripSensitiveObject(payload);
      const summary = summarizeAuxsolRealtime(payload);
      const httpLog = [...capturedLogs].reverse().find((item) => (
        item.operation === 'http'
        && typeof item.endpoint === 'string'
        && String(item.endpoint).includes('findInverterRealTimeInfoBySn')
      ));
      anyRealtimeData = anyRealtimeData || summary.dataPresent;
      realtimeByTarget[target.key] = {
        result: 'OK',
        status: summary.dataPresent ? 'REALTIME_OK' : 'TARGET_FOUND',
        httpStatus: httpLog?.httpStatus ?? null,
        auxsolCode: summary.auxsolCode ?? httpLog?.auxsolCode ?? null,
        dataKind: summary.dataKind,
        dataPresent: summary.dataPresent,
        payloadKeys: summary.payloadKeys,
        dataKeys: summary.dataKeys,
        comparisonWithPrevious: {
          previous: { auxsolCode: 'AWX-0000', dataKind: 'null', dataPresent: false },
          current: { auxsolCode: summary.auxsolCode, dataKind: summary.dataKind, dataPresent: summary.dataPresent },
          sameNullTelemetry: !summary.dataPresent && summary.dataKind === 'null',
        },
        sanitizedPayload: sanitized,
      };

      try {
        const normalized = normalizeAuxsolRealtime(payload, { serialNumber: match.sn });
        normalizationByTarget[target.key] = {
          status: normalized.length ? 'NORMALIZED' : 'EMPTY_PAYLOAD',
          readings: normalized.length,
          confirmedFields: summary.dataPresent
            ? normalizeAuxsolRealtimePreview(payload)
            : { note: 'data=null → sem campos de telemetria' },
        };
      } catch (error) {
        normalizationByTarget[target.key] = {
          status: 'NORMALIZER_ERROR',
          message: error instanceof Error ? error.message : 'unknown',
        };
      }

      // Binding somente com IDs oficiais; não persiste leitura vazia.
      const bindingResult = await upsertBindingIfEligible(prisma, {
        report: targetReport,
        targetKey: target.key,
      });
      bindingByTarget[target.key] = {
        ...bindingResult,
        preparedExternalId: resolveAuxsolBindingExternalId({
          inverterId: targetReport.providerInverterId,
        }),
        preparedExternalMeta: buildAuxsolBindingExternalMeta({
          plantId: targetReport.providerPlantId,
          inverterId: targetReport.providerInverterId,
          serialNumber: targetReport.providerSerial,
          model: targetReport.providerModel,
          gatewayId: targetReport.providerGatewayId,
        }),
      };
    }

    report.discoveryResults = discoveryResults;
    report.realtime = realtimeByTarget;
    report.normalization = normalizationByTarget;
    report.binding = bindingByTarget;

    const bindingCount = await prisma.integrationBinding.count({ where: { provider: 'AUXSOL' } });
    report.bindingSummary = { auxsolBindings: bindingCount };

    const primaryMatch = findTargetInverter(inventory);
    const diagnosis = classifyAuxsolDiscovery({
      plantCount: plants.length,
      targetFound: anyTargetFound,
      realtimeQueried: anyTargetFound,
      dataPresent: anyRealtimeData,
    });
    report.FINAL_STATUS = diagnosisLabel(diagnosis);
    report.stages = [
      'AUTHENTICATED',
      'DISCOVERY_OK',
      ...(anyTargetFound ? ['TARGET_FOUND'] : ['TARGET_NOT_FOUND']),
      ...(anyRealtimeData ? ['REALTIME_OK'] : []),
    ];
    report.note = anyRealtimeData
      ? 'Telemetria presente em pelo menos um alvo. Persistência de leituras NÃO executada (flag off).'
      : 'Integração de coleta NÃO concluída. Descoberta/binding conforme targets; sem telemetria real persistível.';

    // Compat: bloco target José (histórico)
    const jose = discoveryResults.JOSE;
    report.target = jose
      ? {
        sn: AUXSOL_DISCOVERY_TARGETS[0].sn,
        model: AUXSOL_DISCOVERY_TARGETS[0].model,
        gateway: AUXSOL_DISCOVERY_TARGETS[0].gateway,
        found: jose.targetFound,
        plantId: jose.providerPlantId,
        inverterId: jose.providerInverterId,
        inverterSn: jose.providerSerial,
        inverterModel: jose.providerModel,
        inverterGateway: jose.providerGatewayId,
      }
      : { found: false };

    const dumped = JSON.stringify(capturedLogs);
    report.secretLeakedInLogs = /app_secret|AUXSOL_APP_SECRET/i.test(dumped);
    report.tokenLeakedInLogs = /Bearer\s+\S+/i.test(dumped) || /"access_token"\s*:/i.test(dumped);

    originalInfo(JSON.stringify({
      'SPRINT 4 — AUXSOL DISCOVERY': {
        authentication: report.authentication,
        plants: { result: 'OK', count: plants.length, httpStatus: plantHttpStatus, auxsolCode: plantCode },
        discoveryResults,
        realtime: realtimeByTarget,
        normalization: normalizationByTarget,
        binding: bindingByTarget,
        persistence: report.persistence,
        FINAL_STATUS: report.FINAL_STATUS,
        stages: report.stages,
      },
      detail: {
        ...report,
        // evita dump enorme de plants/inverters no stdout principal se já listados
      },
      primaryMatchFound: primaryMatch.found,
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
    await prisma.$disconnect().catch(() => undefined);
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
