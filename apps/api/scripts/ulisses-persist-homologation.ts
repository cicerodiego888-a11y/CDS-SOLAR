/**
 * Homologação controlada: coleta + persistência do inversor Ulisses.
 * Requer AUXSOL_PERSIST_READINGS=true e allowlist com o inverterId.
 * Não muta AUXSOL além da leitura realtime já usada pelo adapter.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { IntegrationCollectionService } from '../src/modules/integrations/collection/integration.collection.service';
import { MonitoringPersistenceService } from '../src/modules/integrations/collection/monitoring.persistence.service';
import {
  isAuxsolInverterPersistAllowed,
  parseAuxsolPersistInverterIds,
} from '../src/modules/integrations/collection/auxsol-persist-scope';
import { createDefaultIntegrationEngine } from '../src/modules/integrations/integration.engine';

const ULISSES_INVERTER_ID = 'cmw76di320001tyys55mvm5ex';
const ULISSES_PLANT_ID = 'cmucots7g0007tymccjpscinm';

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
  const started = Date.now();
  const report: Record<string, unknown> = {
    sprint: 'B7-MONITORING-PERSISTENCE-01',
    at: new Date().toISOString(),
    persistEnv: process.env.AUXSOL_PERSIST_READINGS,
    allowlist: parseAuxsolPersistInverterIds(),
    inverterAllowed: isAuxsolInverterPersistAllowed(ULISSES_INVERTER_ID),
  };

  if (process.env.AUXSOL_PERSIST_READINGS !== 'true') {
    throw new Error('AUXSOL_PERSIST_READINGS deve ser true para esta homologação.');
  }
  if (!isAuxsolInverterPersistAllowed(ULISSES_INVERTER_ID)) {
    throw new Error('Inversor Ulisses fora da AUXSOL_PERSIST_INVERTER_IDS.');
  }

  const prisma = new PrismaClient();
  try {
    const before = await prisma.monitoringReading.count({
      where: { inverterId: ULISSES_INVERTER_ID },
    });
    report.readingsBefore = before;

    const persistence = new MonitoringPersistenceService(prisma as never);
    const collection = new IntegrationCollectionService(prisma as never, persistence)
      .useEngine(createDefaultIntegrationEngine());

    const first = await collection.collectInverter(ULISSES_INVERTER_ID);
    report.firstCollect = {
      ok: first.ok,
      persisted: first.persisted,
      readings: first.readings,
      valid: first.valid,
      powerKw: first.liveReading?.powerKw ?? null,
      energyTodayKwh: first.liveReading?.energyTodayKwh ?? null,
      collectedAt: first.liveReading?.collectedAt ?? null,
      lastCommAt: first.liveReading?.lastCommAt ?? null,
      message: first.message,
    };

    const second = await collection.collectInverter(ULISSES_INVERTER_ID);
    report.secondCollect = {
      ok: second.ok,
      persisted: second.persisted,
      note: 'Reexecução — esperado persisted=0 se mesma collectedAt (idempotência).',
    };

    const afterRows = await prisma.monitoringReading.findMany({
      where: { inverterId: ULISSES_INVERTER_ID, plantId: ULISSES_PLANT_ID },
      orderBy: { collectedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        plantId: true,
        inverterId: true,
        collectedAt: true,
        powerKw: true,
        energyTodayKwh: true,
        sourceProvider: true,
        idempotencyKey: true,
        rawPayload: true,
      },
    });
    report.readingsAfter = await prisma.monitoringReading.count({
      where: { inverterId: ULISSES_INVERTER_ID },
    });
    report.latest = afterRows.map((row) => {
      const raw = JSON.stringify(row.rawPayload || {}).toLowerCase();
      return {
        id: row.id,
        plantId: row.plantId,
        inverterId: row.inverterId,
        collectedAt: row.collectedAt.toISOString(),
        powerKw: row.powerKw?.toString() ?? null,
        energyTodayKwh: row.energyTodayKwh?.toString() ?? null,
        sourceProvider: row.sourceProvider,
        idempotencyKey: row.idempotencyKey,
        rawHasToken: raw.includes('token') || raw.includes('authorization'),
        rawHasSecret: raw.includes('secret') || raw.includes('password'),
      };
    });
    report.durationMs = Date.now() - started;
    const grew = Number(report.readingsAfter) > Number(report.readingsBefore);
    const firstPersisted = Number((report.firstCollect as { persisted?: number }).persisted) > 0;
    report.status = firstPersisted || grew ? 'OK' : 'NO_NEW_ROW';
  } finally {
    await prisma.$disconnect();
  }

  const dir = resolve(__dirname, '../reports/monitoring-persistence');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `ulisses-persist-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
  console.info(JSON.stringify({ reportFile: file, status: report.status, readingsBefore: report.readingsBefore, readingsAfter: report.readingsAfter, firstCollect: report.firstCollect }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
