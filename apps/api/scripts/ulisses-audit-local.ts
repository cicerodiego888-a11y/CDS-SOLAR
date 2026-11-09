/**
 * Auditoria local somente leitura — Sprint B7-ULISSES-01.
 * Não grava nada.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

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
  try {
    const customers = await prisma.customer.findMany({
      where: { name: { contains: 'Ulisses', mode: 'insensitive' } },
      include: {
        plants: {
          include: {
            inverters: {
              include: {
                manufacturerRef: true,
                bindings: true,
                equipment: true,
              },
            },
            equipment: true,
            consumerUnitRef: true,
          },
        },
      },
    });

    const snInv = await prisma.inverter.findMany({
      where: { serialNumber: 'ASN-10SL251016000352' },
      include: {
        plant: { include: { customer: true } },
        bindings: true,
        equipment: true,
        manufacturerRef: true,
      },
    });

    const modelHint = await prisma.inverter.findMany({
      where: {
        OR: [
          { model: { contains: 'ASL-10SL', mode: 'insensitive' } },
          { model: { contains: 'ASN-10SL', mode: 'insensitive' } },
          { serialNumber: { contains: '251016000352' } },
        ],
      },
      include: { plant: { include: { customer: true } }, bindings: true, equipment: true },
    });

    const gw = await prisma.equipment.findMany({
      where: { serialNumber: 'A012510191909021' },
      include: { plant: { include: { customer: true } }, inverter: true },
    });

    const legacyUc = await prisma.plant.findMany({
      where: { consumerUnit: { contains: '003005596601' } },
      include: { customer: true, inverters: true, equipment: true },
    });

    const mfr = await prisma.inverterManufacturer.findMany({ where: { code: 'AUXSOL' } });
    const bindingsAuxsol = await prisma.integrationBinding.findMany({
      where: { provider: 'AUXSOL' },
      include: { inverter: { include: { plant: { include: { customer: true } } } } },
    });

    const otherCustomersCount = await prisma.customer.count({
      where: { NOT: { name: { contains: 'Ulisses', mode: 'insensitive' } } },
    });

    const report = {
      sprint: 'B7-ULISSES-01 AUDIT',
      timestamp: new Date().toISOString(),
      customers,
      snInv,
      modelHint,
      gatewayEquipment: gw,
      legacyUcPlants: legacyUc,
      auxsolManufacturer: mfr,
      auxsolBindings: bindingsAuxsol.map((b) => ({
        id: b.id,
        inverterId: b.inverterId,
        externalId: b.externalId,
        externalMeta: b.externalMeta,
        status: b.status,
        hasSecretRef: Boolean(b.secretRef),
        secretRefValueExposed: false,
        customerName: b.inverter.plant.customer.name,
        plantName: b.inverter.plant.name,
        serialNumber: b.inverter.serialNumber,
      })),
      isolationProbe: { otherCustomersCount },
    };

    const out = resolve(__dirname, '..', 'reports', `ulisses-audit-${Date.now()}.json`);
    writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({ reportFile: out, summary: {
      customers: customers.length,
      plants: customers.flatMap((c) => c.plants).length,
      invertersOnCustomer: customers.flatMap((c) => c.plants.flatMap((p) => p.inverters)).length,
      equipmentOnCustomer: customers.flatMap((c) => c.plants.flatMap((p) => p.equipment)).length,
      snMatches: snInv.length,
      gatewayMatches: gw.length,
      auxsolBindings: bindingsAuxsol.length,
      manufacturer: mfr.map((m) => ({ id: m.id, code: m.code, status: m.integrationStatus })),
    } }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
