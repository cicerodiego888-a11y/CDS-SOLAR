/**
 * B7-DATABASE-CLEANUP-01 — Fase 1: auditoria pré-exclusão (somente leitura + backup).
 * Não executa DELETE.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';

const ULISSES_ID = 'cmucom31o0005tymcu7cgt9d3';
const ULISSES_SN = 'ASN-10SL251016000352';
const ULISSES_BINDING = 'cmw76di400003tyys4dhcrfnh';

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

function parseDatabaseUrl(url: string) {
  const match = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?\s]+)/);
  if (!match) throw new Error('DATABASE_URL inválida');
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: match[4] || '5432',
    database: match[5],
  };
}

function sha256File(path: string) {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

async function countDeps(prisma: PrismaClient, customerId: string) {
  const plants = await prisma.plant.findMany({
    where: { customerId },
    select: { id: true, name: true, installedPowerKw: true, distributor: true, consumerUnit: true, consumerUnitId: true },
  });
  const plantIds = plants.map((p) => p.id);
  const [
    inverters,
    equipment,
    readings,
    alerts,
    bindings,
    memberships,
    users,
    rateioVersions,
  ] = await Promise.all([
    plantIds.length
      ? prisma.inverter.findMany({
        where: { plantId: { in: plantIds } },
        select: {
          id: true,
          plantId: true,
          serialNumber: true,
          model: true,
          manufacturer: true,
          bindings: { select: { id: true, provider: true, externalId: true, status: true } },
        },
      })
      : Promise.resolve([]),
    plantIds.length
      ? prisma.equipment.findMany({
        where: { plantId: { in: plantIds } },
        select: { id: true, plantId: true, type: true, serialNumber: true, inverterId: true },
      })
      : Promise.resolve([]),
    plantIds.length
      ? prisma.monitoringReading.count({ where: { plantId: { in: plantIds } } })
      : Promise.resolve(0),
    plantIds.length
      ? prisma.alert.count({ where: { plantId: { in: plantIds } } })
      : Promise.resolve(0),
    plantIds.length
      ? prisma.integrationBinding.count({
        where: { inverter: { plantId: { in: plantIds } } },
      })
      : Promise.resolve(0),
    prisma.userMembership.count({ where: { customerId } }),
    prisma.user.count({ where: { customerId } }),
    plantIds.length
      ? prisma.energyRateioVersion.count({ where: { plantId: { in: plantIds } } })
      : Promise.resolve(0),
  ]);

  return {
    plants,
    plantCount: plants.length,
    inverters,
    inverterCount: inverters.length,
    equipment,
    equipmentCount: equipment.length,
    readingsCount: readings,
    alertsCount: alerts,
    bindingsCount: bindings,
    membershipsCount: memberships,
    usersLinkedCount: users,
    rateioVersionsCount: rateioVersions,
  };
}

function classifyCustomer(input: {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  createdAt: Date;
  deps: Awaited<ReturnType<typeof countDeps>>;
  joseCandidateIds: string[];
  hasAuxsolRealSn: boolean;
  looksLikeTestName: boolean;
  mentionedInSeedOrFixtures: boolean;
}) {
  if (input.id === ULISSES_ID) {
    return {
      classification: 'PRESERVE' as const,
      confidence: 'CONFIRMED',
      reason: 'Ulisses Lima — ID canônico da sprint; SN e binding reais confirmados.',
      deletionCandidate: false,
    };
  }
  if (input.joseCandidateIds.includes(input.id)) {
    return {
      classification: 'PRESERVE' as const,
      confidence: 'CONFIRMED',
      reason: 'José — cadastro real a preservar (match por nome/documentação local).',
      deletionCandidate: false,
    };
  }
  if (input.hasAuxsolRealSn) {
    return {
      classification: 'REVIEW' as const,
      confidence: 'DOUBT',
      reason: 'Possui SN AUXSOL real conhecido — não excluir sem autorização específica.',
      deletionCandidate: false,
    };
  }
  if (input.looksLikeTestName || input.mentionedInSeedOrFixtures) {
    return {
      classification: 'CANDIDATE_FICTITIOUS' as const,
      confidence: input.deps.plantCount === 0 && input.deps.inverterCount === 0
        ? 'HIGH'
        : 'MEDIUM',
      reason: input.looksLikeTestName
        ? 'Nome/padrão típico de fixture/teste Cursor.'
        : 'Aparece em seed/fixtures de teste.',
      deletionCandidate: true,
    };
  }
  if (
    input.deps.bindingsCount === 0
    && input.deps.readingsCount === 0
    && input.deps.inverterCount === 0
    && !input.document
  ) {
    return {
      classification: 'REVIEW' as const,
      confidence: 'DOUBT',
      reason: 'Sem documento e sem ativos operacionais — origem ambígua; aguardar decisão do PO.',
      deletionCandidate: false,
    };
  }
  return {
    classification: 'REVIEW' as const,
    confidence: 'DOUBT',
    reason: 'Não é Ulisses/José, mas não há evidência inequívoca de fictício. NÃO excluir sem confirmação.',
    deletionCandidate: false,
  };
}

async function main() {
  loadLocalEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL ausente');
  const db = parseDatabaseUrl(databaseUrl);

  const prisma = new PrismaClient();
  const stamp = Date.now();
  const outDir = resolve(__dirname, '..', 'reports', 'database-cleanup', String(stamp));
  mkdirSync(outDir, { recursive: true });

  try {
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const joseMatches = customers.filter((c) => {
      const name = c.name.toLowerCase();
      return (
        name.includes('josé')
        || name.includes('jose')
        || name.includes('rodrigues')
        || name.includes('bezerra')
      );
    });

    // Evidências de fixture/teste (somente metadados locais, sem secret).
    const seedText = existsSync(resolve(__dirname, '..', 'prisma', 'seed.ts'))
      ? readFileSync(resolve(__dirname, '..', 'prisma', 'seed.ts'), 'utf8')
      : '';
    const fixtureHints = [
      'cliente teste',
      'test customer',
      'demo',
      'fixture',
      'cursor',
      'fake',
      'dummy',
      'sample',
      'exemplo',
      'teste',
      'sprint5',
      'sprint 5',
      'cert teste',
    ];

    const knownRealSerials = new Set([
      ULISSES_SN,
      'ASN-10SL2508230101', // José (histórico AUXSOL)
    ]);

    const inventory = [];
    for (const customer of customers) {
      const deps = await countDeps(prisma, customer.id);
      const serials = deps.inverters.map((i) => i.serialNumber).filter(Boolean) as string[];
      const hasAuxsolRealSn = serials.some((sn) => knownRealSerials.has(sn));
      const nameLower = customer.name.toLowerCase();
      const emailLower = (customer.email || '').toLowerCase();
      const documentLower = (customer.document || '').toLowerCase();
      const looksLikeTestName = fixtureHints.some((hint) => nameLower.includes(hint))
        || /^test[\s_-]/i.test(customer.name)
        || /cursor/i.test(customer.name)
        || /fixture/i.test(customer.name)
        || /@b7\.invalid$/i.test(emailLower)
        || /^s5[a-z]?-/i.test(documentLower)
        || serials.some((sn) => /^SN-S5-/i.test(sn) || /TEST/i.test(sn));
      const mentionedInSeedOrFixtures = seedText.includes(customer.name) || seedText.includes(customer.id);

      const decision = classifyCustomer({
        id: customer.id,
        name: customer.name,
        document: customer.document,
        email: customer.email,
        createdAt: customer.createdAt,
        deps,
        joseCandidateIds: joseMatches.map((j) => j.id),
        hasAuxsolRealSn,
        looksLikeTestName,
        mentionedInSeedOrFixtures,
      });

      inventory.push({
        id: customer.id,
        name: customer.name,
        document: customer.document,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        consumerId: customer.consumerId,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        deps: {
          plantCount: deps.plantCount,
          plants: deps.plants,
          inverterCount: deps.inverterCount,
          inverters: deps.inverters,
          equipmentCount: deps.equipmentCount,
          equipment: deps.equipment,
          readingsCount: deps.readingsCount,
          alertsCount: deps.alertsCount,
          bindingsCount: deps.bindingsCount,
          membershipsCount: deps.membershipsCount,
          usersLinkedCount: deps.usersLinkedCount,
          rateioVersionsCount: deps.rateioVersionsCount,
        },
        evidence: {
          looksLikeTestName,
          mentionedInSeedOrFixtures,
          hasAuxsolRealSn,
          serials,
        },
        decision,
      });
    }

    const ulisses = inventory.find((item) => item.id === ULISSES_ID) || null;
    const ulissesIntegrity = ulisses
      ? {
        found: true,
        name: ulisses.name,
        hasTargetSn: ulisses.deps.inverters.some((i) => i.serialNumber === ULISSES_SN),
        hasTargetBinding: ulisses.deps.inverters.some((i) => i.bindings.some((b) => b.id === ULISSES_BINDING)),
      }
      : { found: false };

    // Shared resources probe (não excluir sem impacto).
    const shared = {
      usersTotal: await prisma.user.count(),
      usersWithoutCustomer: await prisma.user.count({ where: { customerId: null } }),
      manufacturers: await prisma.inverterManufacturer.count(),
      distributors: await prisma.distributor.count(),
      consumers: await prisma.consumer.count(),
      consumerUnits: await prisma.consumerUnit.count(),
      integrations: await prisma.integration.count(),
    };

    // Backup: prefer docker pg_dump no container da app; fallback host pg_dump.
    const backupPath = resolve(outDir, `b7_solar-backup-${stamp}.dump`);
    let backup: Record<string, unknown> = { attempted: true, path: backupPath };
    try {
      const dockerContainer = process.env.B7_POSTGRES_CONTAINER || 'b7-solar-postgres';
      const remoteDump = `/tmp/b7_solar_cleanup_${stamp}.dump`;
      execFileSync('docker', [
        'exec', dockerContainer,
        'pg_dump', '-U', db.user, '-d', db.database, '-Fc', '-f', remoteDump,
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      execFileSync('docker', ['cp', `${dockerContainer}:${remoteDump}`, backupPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      backup = {
        attempted: true,
        ok: true,
        path: backupPath,
        format: 'pg_dump custom (-Fc) via docker',
        container: dockerContainer,
        sha256: sha256File(backupPath),
        bytes: readFileSync(backupPath).byteLength,
        verifyHint: `docker exec ${dockerContainer} pg_restore --list ${remoteDump}`,
      };
    } catch (error) {
      const preExisting = resolve(__dirname, '..', 'reports', 'database-cleanup', 'b7_solar-predelete.dump');
      if (existsSync(preExisting)) {
        backup = {
          attempted: true,
          ok: true,
          path: preExisting,
          format: 'pg_dump custom (-Fc) via docker (arquivo pré-existente da fase 1)',
          sha256: sha256File(preExisting),
          bytes: readFileSync(preExisting).byteLength,
          note: error instanceof Error ? error.message : String(error),
          verifyHint: 'Get-FileHash reports/database-cleanup/b7_solar-predelete.dump -Algorithm SHA256',
        };
      } else {
        backup = {
          attempted: true,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          note: 'Backup automático falhou. Não autorizar exclusão até backup manual verificável.',
        };
      }
    }

    const preserve = inventory.filter((i) => i.decision.classification === 'PRESERVE');
    const candidates = inventory.filter((i) => i.decision.deletionCandidate);
    const review = inventory.filter((i) => i.decision.classification === 'REVIEW');

    const plannedDeletes = candidates.map((c) => ({
      customerId: c.id,
      name: c.name,
      plantIds: c.deps.plants.map((p) => p.id),
      inverterIds: c.deps.inverters.map((i) => i.id),
      equipmentIds: c.deps.equipment.map((e) => e.id),
      bindingIds: c.deps.inverters.flatMap((i) => i.bindings.map((b) => b.id)),
      dependencyTotals: {
        plants: c.deps.plantCount,
        inverters: c.deps.inverterCount,
        equipment: c.deps.equipmentCount,
        readings: c.deps.readingsCount,
        alerts: c.deps.alertsCount,
        bindings: c.deps.bindingsCount,
        memberships: c.deps.membershipsCount,
        users: c.deps.usersLinkedCount,
        rateioVersions: c.deps.rateioVersionsCount,
      },
    }));

    const plannedSql = [
      '-- PLANEJADO — NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA DO PO',
      '-- Transação única; rollback integral em falha.',
      'BEGIN;',
      ...plannedDeletes.flatMap((item) => ([
        `-- Customer fictício candidato: ${item.name} (${item.customerId})`,
        `-- Dependências: plants=${item.dependencyTotals.plants}, inverters=${item.dependencyTotals.inverters}, equipment=${item.dependencyTotals.equipment}, readings=${item.dependencyTotals.readings}, alerts=${item.dependencyTotals.alerts}, bindings=${item.dependencyTotals.bindings}, memberships=${item.dependencyTotals.memberships}, users=${item.dependencyTotals.users}, rateio=${item.dependencyTotals.rateioVersions}`,
        item.dependencyTotals.readings
          ? `DELETE FROM "MonitoringReading" WHERE "plantId" IN (SELECT id FROM "Plant" WHERE "customerId" = '${item.customerId}');`
          : '-- sem MonitoringReading',
        item.dependencyTotals.alerts
          ? `DELETE FROM "AlertEvent" WHERE "alertId" IN (SELECT a.id FROM "Alert" a JOIN "Plant" p ON p.id = a."plantId" WHERE p."customerId" = '${item.customerId}');\nDELETE FROM "Alert" WHERE "plantId" IN (SELECT id FROM "Plant" WHERE "customerId" = '${item.customerId}');`
          : '-- sem Alert',
        item.dependencyTotals.bindings
          ? `DELETE FROM "IntegrationBinding" WHERE "inverterId" IN (SELECT i.id FROM "Inverter" i JOIN "Plant" p ON p.id = i."plantId" WHERE p."customerId" = '${item.customerId}');`
          : '-- sem IntegrationBinding',
        item.dependencyTotals.rateioVersions
          ? `DELETE FROM "EnergyRateioLine" WHERE "rateioVersionId" IN (SELECT v.id FROM "EnergyRateioVersion" v JOIN "Plant" p ON p.id = v."plantId" WHERE p."customerId" = '${item.customerId}');\nDELETE FROM "EnergyRateioVersion" WHERE "plantId" IN (SELECT id FROM "Plant" WHERE "customerId" = '${item.customerId}');`
          : '-- sem EnergyRateio',
        item.dependencyTotals.equipment
          ? `DELETE FROM "Equipment" WHERE "plantId" IN (SELECT id FROM "Plant" WHERE "customerId" = '${item.customerId}');`
          : '-- sem Equipment',
        item.dependencyTotals.inverters
          ? `DELETE FROM "Inverter" WHERE "plantId" IN (SELECT id FROM "Plant" WHERE "customerId" = '${item.customerId}');`
          : '-- sem Inverter',
        item.dependencyTotals.memberships
          ? `DELETE FROM "UserMembership" WHERE "customerId" = '${item.customerId}' OR "plantId" IN (SELECT id FROM "Plant" WHERE "customerId" = '${item.customerId}');`
          : '-- sem UserMembership',
        item.dependencyTotals.plants
          ? `DELETE FROM "Plant" WHERE "customerId" = '${item.customerId}';`
          : '-- sem Plant',
        item.dependencyTotals.users
          ? `-- ATENÇÃO: ${item.dependencyTotals.users} User(s) com customerId=${item.customerId}. NÃO excluir User automaticamente; apenas desvincular se aprovado.\nUPDATE "User" SET "customerId" = NULL WHERE "customerId" = '${item.customerId}';`
          : '-- sem User vinculado',
        `DELETE FROM "Customer" WHERE id = '${item.customerId}';`,
      ])),
      '-- Validação pós-delete (deve retornar apenas Ulisses + José):',
      'SELECT id, name FROM "Customer" ORDER BY name;',
      'COMMIT;',
    ].join('\n');

    const report = {
      sprint: 'B7-DATABASE-CLEANUP-01',
      phase: 'PRE-DELETION AUDIT — AWAITING PO AUTHORIZATION',
      deletionsExecuted: false,
      timestamp: new Date().toISOString(),
      database: {
        host: db.host,
        port: db.port,
        name: db.database,
        user: db.user,
        identifiedAs: 'apps/api/.env DATABASE_URL → PostgreSQL local b7_solar',
      },
      preserveTargets: {
        ulissesExpectedId: ULISSES_ID,
        ulissesIntegrity,
        joseMatches: joseMatches.map((j) => ({
          id: j.id,
          name: j.name,
          document: j.document,
          email: j.email,
          createdAt: j.createdAt,
        })),
        note: joseMatches.length === 1
          ? 'Um único José localizado — usar este como preservar.'
          : joseMatches.length === 0
            ? 'NENHUM José encontrado pelo nome. Abortar exclusão até identificação.'
            : 'Múltiplos José — PO deve confirmar qual preservar.',
      },
      inventory,
      summary: {
        totalCustomers: inventory.length,
        preserveCount: preserve.length,
        candidateFictitiousCount: candidates.length,
        reviewCount: review.length,
        preserveIds: preserve.map((p) => ({ id: p.id, name: p.name })),
        candidateIds: candidates.map((c) => ({ id: c.id, name: c.name, confidence: c.decision.confidence })),
        reviewIds: review.map((r) => ({ id: r.id, name: r.name, reason: r.decision.reason })),
      },
      sharedResources: shared,
      risks: [
        'Customer.cascade remove Plants; Plant.cascade remove Inverters/Equipment/Readings/Alerts — exclusão deve ser ordenada e limitada aos IDs aprovados.',
        'User.customerId e UserMembership podem referenciar clientes fictícios; usuários compartilhados NÃO devem ser apagados sem análise.',
        'Consumer/ConsumerUnit/Distributor/Manufacturer são compartilhados — fora do escopo de exclusão automática.',
        'Se José não for unicamente identificado, nenhuma exclusão deve ocorrer.',
        'Backup é pré-requisito; se backup.ok=false, bloquear execução.',
      ],
      transactionalPlan: {
        steps: [
          '1. Confirmar backup.ok=true e sha256.',
          '2. PO autorizar lista EXATA de customerIds candidatos.',
          '3. BEGIN; deletes ordenados por dependência apenas dos IDs aprovados.',
          '4. Validar COUNT Customer = 2 (Ulisses+José) e integridade Ulisses SN/binding.',
          '5. Reexecutar collect liveReading Ulisses (persist OFF).',
          '6. COMMIT; se falha → ROLLBACK integral.',
        ],
        forbidden: ['TRUNCATE', 'DROP DATABASE', 'prisma migrate reset', 'seed', 'CASCADE indiscriminado', 'DELETE sem WHERE'],
      },
      plannedDeletes,
      plannedSql,
      backup,
      authorizationGate: {
        status: 'WAITING_PO_APPROVAL',
        requiredApproval: 'Lista explícita de customerIds a excluir',
        doNotExecuteUntilApproved: true,
      },
    };

    const reportPath = resolve(outDir, 'PRE-DELETION-REPORT.json');
    const sqlPath = resolve(outDir, 'PLANNED-DELETES.sql');
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    writeFileSync(sqlPath, plannedSql, 'utf8');
    console.log(JSON.stringify({
      reportFile: reportPath,
      sqlFile: sqlPath,
      backup,
      summary: report.summary,
      preserveTargets: report.preserveTargets,
      authorizationGate: report.authorizationGate,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
