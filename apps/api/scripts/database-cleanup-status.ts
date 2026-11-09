/** Status final somente leitura. */
import { existsSync, readFileSync } from 'node:fs';
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  loadLocalEnv();
  const prisma = new PrismaClient();
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { name: 'asc' },
      include: {
        plants: {
          include: {
            inverters: { include: { bindings: { select: { id: true, provider: true, status: true, externalId: true } } } },
            equipment: { select: { id: true, type: true, serialNumber: true } },
          },
        },
      },
    });
    const leftovers = {
      sprintConsumers: await prisma.consumer.count({ where: { name: { contains: 'SPRINT5', mode: 'insensitive' } } }),
      sprintDistributor: await prisma.distributor.count({ where: { name: { contains: 'SPRINT5', mode: 'insensitive' } } }),
      users: await prisma.user.count(),
      manufacturers: await prisma.inverterManufacturer.count(),
    };
    console.log(JSON.stringify({
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        plants: c.plants.map((p) => ({
          id: p.id,
          name: p.name,
          inverters: p.inverters.map((i) => ({
            id: i.id,
            sn: i.serialNumber,
            bindings: i.bindings,
          })),
          equipment: p.equipment,
        })),
      })),
      leftovers,
      customerCount: customers.length,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
