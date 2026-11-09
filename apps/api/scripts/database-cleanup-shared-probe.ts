/** Probe somente leitura: Consumers/Distributors ligados a SPRINT5. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

function loadLocalEnv() {
  const envPath = [resolve(process.cwd(), '.env'), resolve(__dirname, '..', '.env')].find((p) => existsSync(p));
  if (!envPath) throw new Error('.env ausente');
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  loadLocalEnv();
  const prisma = new PrismaClient();
  try {
    const sprintCustomers = await prisma.customer.findMany({
      where: { name: { contains: 'SPRINT5', mode: 'insensitive' } },
      select: { id: true, name: true, consumerId: true },
    });
    const consumerIds = sprintCustomers.map((c) => c.consumerId).filter(Boolean) as string[];
    const consumers = consumerIds.length
      ? await prisma.consumer.findMany({ where: { id: { in: consumerIds } } })
      : [];
    const units = await prisma.consumerUnit.findMany({
      where: {
        OR: [
          { number: { contains: 'S5', mode: 'insensitive' } },
          { number: { contains: '910000', mode: 'insensitive' } },
          { number: { contains: 'LEGACY-UC', mode: 'insensitive' } },
        ],
      },
      include: { distributor: true, consumer: true },
    });
    const distributors = await prisma.distributor.findMany();
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, customerId: true },
    });
    const out = {
      sprintCustomers,
      consumersLinkedToSprintCustomers: consumers,
      consumerUnitsLikelySprint: units.map((u) => ({
        id: u.id,
        number: u.number,
        distributor: u.distributor?.name,
        consumerName: u.consumer?.name,
      })),
      allDistributors: distributors.map((d) => ({ id: d.id, name: d.code, display: d.name })),
      users,
      note: 'Consumer/UC/Distributor NÃO entram no DELETE automático de Customer sem aprovação explícita extra.',
    };
    const path = resolve(__dirname, '..', 'reports', 'database-cleanup', 'shared-resources-probe.json');
    writeFileSync(path, JSON.stringify(out, null, 2), 'utf8');
    console.log(JSON.stringify({ path, out }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
