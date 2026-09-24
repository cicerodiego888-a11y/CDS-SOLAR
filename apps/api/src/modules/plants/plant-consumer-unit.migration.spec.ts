import { readFileSync } from 'fs';
import { join } from 'path';

describe('migration Plant ↔ ConsumerUnit', () => {
  const migrationSql = readFileSync(
    join(__dirname, '../../../prisma/migrations/20260924140000_plant_consumer_unit_link/migration.sql'),
    'utf8',
  );
  const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');

  it('adiciona campos opcionais sem apagar dados nem DROP', () => {
    expect(migrationSql).toContain('ALTER TABLE "ConsumerUnit" ADD COLUMN "contractAccount" TEXT');
    expect(migrationSql).toContain('ALTER TABLE "Plant" ADD COLUMN "consumerUnitId" TEXT');
    expect(migrationSql).toContain('FOREIGN KEY ("consumerUnitId") REFERENCES "ConsumerUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE');
    expect(migrationSql).not.toMatch(/"consumerUnitId" TEXT NOT NULL/);
    expect(migrationSql).not.toMatch(/"contractAccount" TEXT NOT NULL/);
    expect(migrationSql).not.toMatch(/DROP\s/i);
    expect(migrationSql).not.toMatch(/DELETE\s+FROM/i);
    expect(migrationSql).not.toMatch(/TRUNCATE/i);
    expect(migrationSql).not.toMatch(/IntegrationBinding|MonitoringReading|AUXSOL|Auxsol|Collector|Normalizer/i);
  });

  it('preserva campos legados e reutiliza ConsumerUnit.number', () => {
    expect(schema).toMatch(/consumerUnitId\s+String\?/);
    expect(schema).toMatch(/consumerUnitRef\s+ConsumerUnit\?\s+@relation/);
    expect(schema).toMatch(/contractAccount\s+String\?/);
    expect(schema).toMatch(/distributor\s+String\?/);
    expect(schema).toMatch(/consumerUnit\s+String\?/);
    expect(schema).toMatch(/number\s+String/);
    expect(schema).not.toMatch(/consumerUnitNumber/);
    expect(schema).toMatch(/@@unique\(\[distributorId, number\]\)/);
    expect(schema).toMatch(/model IntegrationBinding \{/);
    expect(schema).toMatch(/model MonitoringReading \{/);
  });
});
