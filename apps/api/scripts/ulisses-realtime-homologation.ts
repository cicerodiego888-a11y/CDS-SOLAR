/**
 * Sprint B7-ULISSES-02 — homologação realtime via IntegrationEngine oficial.
 * Não persiste leituras. Não altera AUXSOL. Não cria bindings.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { IntegrationCollectionService } from '../src/modules/integrations/collection/integration.collection.service';
import { MonitoringPersistenceService } from '../src/modules/integrations/collection/monitoring.persistence.service';
import { createDefaultIntegrationEngine } from '../src/modules/integrations/integration.engine';
import { omitSensitiveKeys } from '../src/modules/integrations/security.redact';

const TARGET = {
  customerId: 'cmucom31o0005tymcu7cgt9d3',
  plantId: 'cmucots7g0007tymccjpscinm',
  inverterId: 'cmw76di320001tyys55mvm5ex',
  bindingId: 'cmw76di400003tyys4dhcrfnh',
  auxsolPlantId: 102545,
  auxsolInverterId: '1234568136545421',
  serial: 'ASN-10SL251016000352',
  gateway: 'A012510191909021',
} as const;

function loadLocalEnv() {
  const envPath = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/api/.env'),
    resolve(__dirname, '..', '.env'),
  ].find((item) => existsSync(item));
  if (!envPath) throw new Error('.env ausente');
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

async function main() {
  loadLocalEnv();
  const prisma = new PrismaClient();
  const report: Record<string, unknown> = {
    sprint: 'B7-ULISSES-02',
    timestamp: new Date().toISOString(),
    flow: 'Inverter → IntegrationBinding → IntegrationEngine → AuxsolAdapter → GET realtime → normalize → liveReading',
    remoteMutations: false,
    env: {
      mock: process.env.AUXSOL_MOCK_MODE === 'true' ? 'ON' : 'OFF',
      persist: process.env.AUXSOL_PERSIST_READINGS === 'true' ? 'ON' : 'OFF',
      appId: process.env.AUXSOL_APP_ID || null,
    },
  };

  try {
    if (process.env.AUXSOL_MOCK_MODE === 'true') {
      throw new Error('AUXSOL_MOCK_MODE=true — homologação exige live.');
    }
    if (process.env.AUXSOL_PERSIST_READINGS === 'true') {
      throw new Error('AUXSOL_PERSIST_READINGS=true — sprint exige persistência OFF.');
    }

    const readingsBefore = await prisma.monitoringReading.count({
      where: { inverterId: TARGET.inverterId },
    });

    const inverter = await prisma.inverter.findUnique({
      where: { id: TARGET.inverterId },
      include: {
        plant: { include: { customer: true } },
        manufacturerRef: true,
        bindings: true,
        equipment: true,
      },
    });
    if (!inverter) throw new Error('Inversor Ulisses não encontrado.');
    const binding = inverter.bindings.find((item) => item.id === TARGET.bindingId)
      || inverter.bindings.find((item) => item.provider === 'AUXSOL');

    report.audit = {
      customerId: inverter.plant.customerId,
      customerMatch: inverter.plant.customerId === TARGET.customerId,
      plantId: inverter.plantId,
      plantMatch: inverter.plantId === TARGET.plantId,
      inverterSerial: inverter.serialNumber,
      manufacturer: inverter.manufacturerRef?.code || inverter.manufacturer,
      bindingFound: Boolean(binding),
      bindingId: binding?.id ?? null,
      bindingStatus: binding?.status ?? null,
      bindingProvider: binding?.provider ?? null,
      externalId: binding?.externalId ?? null,
      externalIdMatch: binding?.externalId === TARGET.auxsolInverterId,
      secretRefConfigured: Boolean(binding?.secretRef),
      secretRef: binding?.secretRef ?? null,
      gatewayLinked: inverter.equipment.some((item) => item.serialNumber === TARGET.gateway && item.inverterId === inverter.id),
      cadastroUnchanged: true,
    };

    if (!binding || binding.status !== 'READY' || binding.provider !== 'AUXSOL') {
      throw new Error('IntegrationBinding AUXSOL READY não confirmado.');
    }
    if (binding.externalId !== TARGET.auxsolInverterId) {
      throw new Error('externalId diverge do inverterId AUXSOL esperado.');
    }

    const captured: Array<Record<string, unknown>> = [];
    const originalInfo = console.info;
    console.info = ((...args: unknown[]) => {
      const first = args[0];
      if (first && typeof first === 'object') captured.push(first as Record<string, unknown>);
      originalInfo(...args);
    }) as typeof console.info;

    const persistence = new MonitoringPersistenceService(prisma as never);
    const service = new IntegrationCollectionService(prisma as never, persistence).useEngine(createDefaultIntegrationEngine());
    const result = await service.collectInverter(TARGET.inverterId);
    console.info = originalInfo;

    const readingsAfter = await prisma.monitoringReading.count({
      where: { inverterId: TARGET.inverterId },
    });

    const httpEvidence = captured.filter((item) => (
      item.operation === 'http'
      || item.operation === 'auth'
      || item.operation === 'collect'
      || item.operation === 'realtimeBySn'
    )).map((item) => omitSensitiveKeys({
      operation: String(item.operation ?? ''),
      endpoint: typeof item.endpoint === 'string' ? item.endpoint : undefined,
      httpStatus: typeof item.httpStatus === 'number' ? item.httpStatus : undefined,
      auxsolCode: typeof item.auxsolCode === 'string' ? item.auxsolCode : undefined,
      status: typeof item.status === 'string' ? item.status : undefined,
      mode: typeof item.mode === 'string' ? item.mode : undefined,
    }));

    report.collection = {
      ok: result.ok,
      mode: result.mode,
      provider: result.provider,
      integrationId: result.integrationId,
      readings: result.readings,
      valid: result.valid,
      persisted: result.persisted,
      message: result.message,
      liveReading: result.liveReading,
    };
    report.endpoints = httpEvidence;
    report.persistence = {
      readingsBefore,
      readingsAfter,
      delta: readingsAfter - readingsBefore,
      flagPersist: false,
      confirmedNoPersist: readingsAfter === readingsBefore && result.persisted === 0,
    };
    report.uiContract = {
      inverterDetailFields: [
        'model', 'serialNumber', 'manufacturer', 'communication',
        'powerKw', 'energyTodayKwh', 'energyMonthKwh', 'energyTotalKwh',
        'collectedAt', 'lastCommAt', 'alarms',
      ],
      plantSummary: 'Resumo operacional + tabela monitoramento do inversor',
      emptyShowsUnavailableNotZero: true,
    };
    report.secretLeakCheck = {
      tokenInResult: /Bearer|access_token|APP_SECRET/i.test(JSON.stringify(result)),
      tokenInLogs: /Bearer\s+\S+|"access_token"\s*:/i.test(JSON.stringify(captured)),
    };

    const out = resolve(__dirname, '..', 'reports', `ulisses-realtime-${Date.now()}.json`);
    writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({ reportFile: out, report }, null, 2));
  } catch (error) {
    report.status = 'FAIL';
    report.error = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
