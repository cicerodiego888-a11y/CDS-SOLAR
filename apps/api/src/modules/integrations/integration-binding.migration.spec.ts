import { readFileSync } from 'fs';
import { join } from 'path';

describe('migration IntegrationBinding.externalMeta', () => {
  const migrationSql = readFileSync(
    join(__dirname, '../../../prisma/migrations/20260924160000_integration_binding_external_meta/migration.sql'),
    'utf8',
  );
  const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');

  it('é aditiva e não altera AUXSOL/monitoramento', () => {
    expect(migrationSql).toContain('ALTER TABLE "IntegrationBinding" ADD COLUMN "externalMeta" JSONB');
    expect(migrationSql).not.toMatch(/DROP\s/i);
    expect(migrationSql).not.toMatch(/DELETE\s+FROM/i);
    expect(migrationSql).not.toMatch(/MonitoringReading|Collector|Normalizer|Alert/i);
    expect(schema).toMatch(/externalMeta\s+Json\?/);
    expect(schema).toMatch(/Equipment\.inverterId|inverterId\s+String\?/);
    expect(schema).toMatch(/@@unique\(\[plantId, serialNumber\]\)/);
    expect(schema).not.toMatch(/auxsolPlantId|deyePlantId|huaweiPlantId|sungrowPlantId/);
  });
});
