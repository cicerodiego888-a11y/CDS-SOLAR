import { writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { LegacyPlantAuditService } from '../src/modules/plants/legacy-plant-audit.service';

async function main() {
  const prisma = new PrismaClient();
  try {
    const service = new LegacyPlantAuditService(prisma as never);
    const report = await service.buildReport();
    const outPath = join(process.cwd(), 'reports', `legacy-plants-audit-${Date.now()}.json`);
    try {
      writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
      console.log(`Relatório salvo em ${outPath}`);
    } catch {
      console.log(JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify(report.totals, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
