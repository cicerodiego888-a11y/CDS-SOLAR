/**
 * Aplica Sprint B7-ULISSES-01 no banco local.
 * Sem mutações AUXSOL. Sem persistência de telemetria.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ensureUlissesLimaRegistration } from '../src/modules/integrations/binding/ulisses-lima.registration';

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
  if (process.env.AUXSOL_PERSIST_READINGS === 'true') {
    throw new Error('AUXSOL_PERSIST_READINGS=true — sprint proíbe persistência de telemetria.');
  }

  const prisma = new PrismaClient();
  try {
    const report = await ensureUlissesLimaRegistration(prisma);
    const out = resolve(__dirname, '..', 'reports', `ulisses-register-${Date.now()}.json`);
    writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({ reportFile: out, report }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAIL',
    message: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
