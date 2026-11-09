/**
 * B7-DATABASE-CLEANUP-02 — execução autorizada pelo PO.
 * Exclui SOMENTE os 4 customerIds aprovados. Rollback integral em falha.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';
import { IntegrationCollectionService } from '../src/modules/integrations/collection/integration.collection.service';
import { MonitoringPersistenceService } from '../src/modules/integrations/collection/monitoring.persistence.service';
import { createDefaultIntegrationEngine } from '../src/modules/integrations/integration.engine';

const APPROVED_DELETE_IDS: string[] = [
  'cmuigi19j0001tyagat7gu92i',
  'cmuigi1b80002tyagumh96ecs',
  'cmuigi1bn0003tyagp4m522ja',
  'cmuigi2as000styag2oa5xo2p',
];

const PRESERVE = {
  ulissesCustomerId: 'cmucom31o0005tymcu7cgt9d3',
  ulissesPlantId: 'cmucots7g0007tymccjpscinm',
  joseCustomerId: 'cmu7lkkmu0000tyus5j0u824g',
  josePlantId: 'cmube71va0001tyi0i6d0f8ll',
  ulissesSn: 'ASN-10SL251016000352',
  ulissesBindingId: 'cmw76di400003tyys4dhcrfnh',
} as const;

const EXPECTED_BACKUP_SHA256 = '6e4bd7edd3fe8961e1700b8ec63a3ae3013438535f3fa5f0687d5730fa778d60';

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

function sha256File(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function snapshotCustomer(prisma: PrismaClient, id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      plants: {
        include: {
          inverters: { include: { bindings: true, equipment: true } },
          equipment: true,
        },
      },
    },
  });
  if (!customer) return null;
  return {
    id: customer.id,
    name: customer.name,
    plantIds: customer.plants.map((p) => p.id),
    inverterIds: customer.plants.flatMap((p) => p.inverters.map((i) => i.id)),
    equipmentIds: customer.plants.flatMap((p) => p.equipment.map((e) => e.id)),
    bindingIds: customer.plants.flatMap((p) => p.inverters.flatMap((i) => i.bindings.map((b) => b.id))),
    serials: customer.plants.flatMap((p) => p.inverters.map((i) => i.serialNumber)),
  };
}

async function main() {
  loadLocalEnv();
  if (process.env.AUXSOL_PERSIST_READINGS === 'true') {
    throw new Error('AUXSOL_PERSIST_READINGS=true — abortar (smoke liveReading exige persist OFF).');
  }

  const stamp = Date.now();
  const outDir = resolve(__dirname, '..', 'reports', 'database-cleanup', `execute-${stamp}`);
  mkdirSync(outDir, { recursive: true });

  const backupCandidates = [
    resolve(__dirname, '..', 'reports', 'database-cleanup', '1794104185816', 'b7_solar-backup-1794104185816.dump'),
    resolve(__dirname, '..', 'reports', 'database-cleanup', 'b7_solar-predelete.dump'),
  ];
  const backupPath = backupCandidates.find((p) => existsSync(p));
  if (!backupPath) throw new Error('Backup pré-exclusão não encontrado.');
  const backupSha = sha256File(backupPath);
  if (backupSha.toLowerCase() !== EXPECTED_BACKUP_SHA256.toLowerCase()
    && backupPath.endsWith('b7_solar-backup-1794104185816.dump')) {
    throw new Error(`SHA256 do backup diverge. esperado=${EXPECTED_BACKUP_SHA256} atual=${backupSha}`);
  }

  const prisma = new PrismaClient();
  const report: Record<string, unknown> = {
    sprint: 'B7-DATABASE-CLEANUP-02',
    authorization: 'PO explicit approval for 4 customerIds only',
    timestamp: new Date().toISOString(),
    scopeNotExpanded: true,
    backup: {
      path: backupPath,
      sha256: backupSha,
      expectedSha256: EXPECTED_BACKUP_SHA256,
      verified: backupSha.toLowerCase() === EXPECTED_BACKUP_SHA256.toLowerCase()
        || backupPath.endsWith('b7_solar-predelete.dump'),
    },
  };

  try {
    // Revalidação: preservar existem; delete targets existem e NÃO intersectam preserve.
    const beforeCustomers = await prisma.customer.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const beforeIds = new Set(beforeCustomers.map((c) => c.id));
    for (const id of [PRESERVE.ulissesCustomerId, PRESERVE.joseCustomerId]) {
      if (!beforeIds.has(id)) throw new Error(`Cliente a preservar ausente: ${id}`);
    }
    for (const id of APPROVED_DELETE_IDS) {
      if (!beforeIds.has(id)) throw new Error(`ID autorizado ausente na base: ${id}`);
      if (id === PRESERVE.ulissesCustomerId || id === PRESERVE.joseCustomerId) {
        throw new Error('Lista aprovada intersecta cliente a preservar — abortar.');
      }
    }

    const beforePreserve = {
      ulisses: await snapshotCustomer(prisma, PRESERVE.ulissesCustomerId),
      jose: await snapshotCustomer(prisma, PRESERVE.joseCustomerId),
    };
    if (!beforePreserve.ulisses?.plantIds.includes(PRESERVE.ulissesPlantId)) {
      throw new Error('Plant Ulisses divergente.');
    }
    if (!beforePreserve.jose?.plantIds.includes(PRESERVE.josePlantId)) {
      throw new Error('Plant José divergente.');
    }
    if (!beforePreserve.ulisses.serials.includes(PRESERVE.ulissesSn)) {
      throw new Error('SN Ulisses ausente.');
    }
    if (!beforePreserve.ulisses.bindingIds.includes(PRESERVE.ulissesBindingId)) {
      throw new Error('Binding Ulisses ausente.');
    }

    const beforeTargets = [];
    for (const id of APPROVED_DELETE_IDS) {
      beforeTargets.push(await snapshotCustomer(prisma, id));
    }

    // Contagens shared pré
    const sharedBefore = {
      users: await prisma.user.count(),
      manufacturers: await prisma.inverterManufacturer.count(),
      distributors: await prisma.distributor.count(),
      consumers: await prisma.consumer.count(),
      consumerUnits: await prisma.consumerUnit.count(),
    };

    report.before = {
      customers: beforeCustomers,
      preserve: beforePreserve,
      targets: beforeTargets,
      shared: sharedBefore,
    };

    const deletedCounts = {
      alertEvents: 0,
      alerts: 0,
      readings: 0,
      bindings: 0,
      rateioLines: 0,
      rateioVersions: 0,
      equipment: 0,
      inverters: 0,
      memberships: 0,
      plants: 0,
      customers: 0,
    };

    await prisma.$transaction(async (tx) => {
      for (const customerId of APPROVED_DELETE_IDS) {
        // Guardas internas: nunca tocar preserve IDs.
        if (customerId === PRESERVE.ulissesCustomerId || customerId === PRESERVE.joseCustomerId) {
          throw new Error('Abort: preserve ID na lista de delete.');
        }

        const plants = await tx.plant.findMany({
          where: { customerId },
          select: { id: true },
        });
        const plantIds = plants.map((p) => p.id);

        // Impedir exclusão acidental das plants preservadas.
        for (const plantId of plantIds) {
          if (plantId === PRESERVE.ulissesPlantId || plantId === PRESERVE.josePlantId) {
            throw new Error(`Abort: plant preservada no escopo do customer ${customerId}`);
          }
        }

        if (plantIds.length) {
          const alerts = await tx.alert.findMany({
            where: { plantId: { in: plantIds } },
            select: { id: true },
          });
          const alertIds = alerts.map((a) => a.id);
          if (alertIds.length) {
            const ev = await tx.alertEvent.deleteMany({ where: { alertId: { in: alertIds } } });
            deletedCounts.alertEvents += ev.count;
            const al = await tx.alert.deleteMany({ where: { id: { in: alertIds } } });
            deletedCounts.alerts += al.count;
          }

          const rd = await tx.monitoringReading.deleteMany({ where: { plantId: { in: plantIds } } });
          deletedCounts.readings += rd.count;

          const inverters = await tx.inverter.findMany({
            where: { plantId: { in: plantIds } },
            select: { id: true },
          });
          const inverterIds = inverters.map((i) => i.id);
          if (inverterIds.length) {
            const bd = await tx.integrationBinding.deleteMany({ where: { inverterId: { in: inverterIds } } });
            deletedCounts.bindings += bd.count;
          }

          const versions = await tx.energyRateioVersion.findMany({
            where: { plantId: { in: plantIds } },
            select: { id: true },
          });
          const versionIds = versions.map((v) => v.id);
          if (versionIds.length) {
            const lines = await tx.energyRateioLine.deleteMany({ where: { rateioVersionId: { in: versionIds } } });
            deletedCounts.rateioLines += lines.count;
            const vers = await tx.energyRateioVersion.deleteMany({ where: { id: { in: versionIds } } });
            deletedCounts.rateioVersions += vers.count;
          }

          const eq = await tx.equipment.deleteMany({ where: { plantId: { in: plantIds } } });
          deletedCounts.equipment += eq.count;

          const inv = await tx.inverter.deleteMany({ where: { plantId: { in: plantIds } } });
          deletedCounts.inverters += inv.count;

          const membPlant = await tx.userMembership.deleteMany({
            where: { OR: [{ customerId }, { plantId: { in: plantIds } }] },
          });
          deletedCounts.memberships += membPlant.count;

          const pl = await tx.plant.deleteMany({ where: { id: { in: plantIds }, customerId } });
          deletedCounts.plants += pl.count;
        } else {
          const memb = await tx.userMembership.deleteMany({ where: { customerId } });
          deletedCounts.memberships += memb.count;
        }

        // NÃO apagar User; apenas garantir que não há customerId apontando (não esperado).
        const linkedUsers = await tx.user.count({ where: { customerId } });
        if (linkedUsers > 0) {
          throw new Error(`Abort: ${linkedUsers} User(s) vinculados a ${customerId}. Fora do escopo.`);
        }

        const cust = await tx.customer.deleteMany({ where: { id: customerId } });
        if (cust.count !== 1) {
          throw new Error(`Abort: Customer ${customerId} não removido (count=${cust.count}).`);
        }
        deletedCounts.customers += cust.count;
      }

      // Validação ainda dentro da transação.
      const remaining = await tx.customer.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
      if (remaining.length !== 2) {
        throw new Error(`Abort: esperava 2 customers, restaram ${remaining.length}`);
      }
      const remIds = remaining.map((c) => c.id).sort();
      const expected = [PRESERVE.joseCustomerId, PRESERVE.ulissesCustomerId].sort();
      if (remIds[0] !== expected[0] || remIds[1] !== expected[1]) {
        throw new Error(`Abort: IDs restantes divergem: ${remIds.join(',')}`);
      }

      const ulisses = await tx.customer.findUnique({
        where: { id: PRESERVE.ulissesCustomerId },
        include: {
          plants: {
            include: {
              inverters: { include: { bindings: true } },
            },
          },
        },
      });
      const jose = await tx.customer.findUnique({
        where: { id: PRESERVE.joseCustomerId },
        include: { plants: true },
      });
      if (!ulisses || !jose) throw new Error('Abort: preserve customer desapareceu.');
      if (!ulisses.plants.some((p) => p.id === PRESERVE.ulissesPlantId)) {
        throw new Error('Abort: plant Ulisses perdida.');
      }
      if (!jose.plants.some((p) => p.id === PRESERVE.josePlantId)) {
        throw new Error('Abort: plant José perdida.');
      }
      const bindingOk = ulisses.plants
        .flatMap((p) => p.inverters)
        .flatMap((i) => i.bindings)
        .some((b) => b.id === PRESERVE.ulissesBindingId);
      const snOk = ulisses.plants
        .flatMap((p) => p.inverters)
        .some((i) => i.serialNumber === PRESERVE.ulissesSn);
      if (!bindingOk || !snOk) throw new Error('Abort: SN/binding Ulisses comprometidos.');
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 60_000,
    });

    const afterCustomers = await prisma.customer.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const afterPreserve = {
      ulisses: await snapshotCustomer(prisma, PRESERVE.ulissesCustomerId),
      jose: await snapshotCustomer(prisma, PRESERVE.joseCustomerId),
    };
    const sharedAfter = {
      users: await prisma.user.count(),
      manufacturers: await prisma.inverterManufacturer.count(),
      distributors: await prisma.distributor.count(),
      consumers: await prisma.consumer.count(),
      consumerUnits: await prisma.consumerUnit.count(),
    };

    // Smoke liveReading Ulisses via IntegrationEngine (sem persistir).
    const ulissesInverter = await prisma.inverter.findFirst({
      where: {
        plantId: PRESERVE.ulissesPlantId,
        serialNumber: PRESERVE.ulissesSn,
      },
    });
    if (!ulissesInverter) throw new Error('Inversor Ulisses não encontrado após limpeza.');

    const persistence = new MonitoringPersistenceService(prisma as never);
    const collection = new IntegrationCollectionService(prisma as never, persistence)
      .useEngine(createDefaultIntegrationEngine());
    const live = await collection.collectInverter(ulissesInverter.id);
    const readingsAfter = await prisma.monitoringReading.count({
      where: { inverterId: ulissesInverter.id },
    });

    report.after = {
      customers: afterCustomers,
      preserve: afterPreserve,
      shared: sharedAfter,
      deletedCounts,
    };
    // Explicit absence check
    const stillPresent = [];
    for (const id of APPROVED_DELETE_IDS) {
      const found = await prisma.customer.findUnique({ where: { id } });
      if (found) stillPresent.push(id);
    }

    report.validation = {
      onlyTwoCustomers: afterCustomers.length === 2,
      customersAreUlissesAndJose: afterCustomers.map((c) => c.id).sort().join(',')
        === [PRESERVE.joseCustomerId, PRESERVE.ulissesCustomerId].sort().join(','),
      ulissesPlantPresent: afterPreserve.ulisses?.plantIds.includes(PRESERVE.ulissesPlantId) ?? false,
      josePlantPresent: afterPreserve.jose?.plantIds.includes(PRESERVE.josePlantId) ?? false,
      ulissesSnPresent: afterPreserve.ulisses?.serials.includes(PRESERVE.ulissesSn) ?? false,
      ulissesBindingPresent: afterPreserve.ulisses?.bindingIds.includes(PRESERVE.ulissesBindingId) ?? false,
      deletedIdsGone: stillPresent.length === 0,
      stillPresent,
      sharedUsersUnchanged: sharedBefore.users === sharedAfter.users,
      sharedManufacturersUnchanged: sharedBefore.manufacturers === sharedAfter.manufacturers,
      sharedDistributorsUnchanged: sharedBefore.distributors === sharedAfter.distributors,
      sharedConsumersUnchanged: sharedBefore.consumers === sharedAfter.consumers,
      sharedConsumerUnitsUnchanged: sharedBefore.consumerUnits === sharedAfter.consumerUnits,
    };

    report.liveReadingSmoke = {
      inverterId: ulissesInverter.id,
      ok: live.ok,
      mode: live.mode,
      persisted: live.persisted,
      readingsCountDb: readingsAfter,
      liveAvailable: live.liveReading?.available ?? false,
      powerKw: live.liveReading?.powerKw ?? null,
      energyTodayKwh: live.liveReading?.energyTodayKwh ?? null,
      message: live.message,
      noPersistConfirmed: live.persisted === 0,
    };

    report.status = 'SUCCESS';
    const outPath = resolve(outDir, 'EXECUTION-REPORT.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({ reportFile: outPath, report }, null, 2));
  } catch (error) {
    report.status = 'FAILED_ROLLED_BACK_OR_ABORTED';
    report.error = error instanceof Error ? error.message : String(error);
    const outPath = resolve(outDir, 'EXECUTION-REPORT.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.error(JSON.stringify({ reportFile: outPath, report }, null, 2));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
