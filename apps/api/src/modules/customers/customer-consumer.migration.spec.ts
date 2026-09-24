import { readFileSync } from 'fs';
import { join } from 'path';

describe('migration Customer ↔ Consumer', () => {
  const migrationSql = readFileSync(
    join(__dirname, '../../../prisma/migrations/20260924120000_customer_consumer_link/migration.sql'),
    'utf8',
  );
  const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');

  it('adiciona consumerId opcional e único sem apagar dados', () => {
    expect(migrationSql).toContain('ALTER TABLE "Customer" ADD COLUMN "consumerId" TEXT');
    expect(migrationSql).not.toMatch(/"consumerId" TEXT NOT NULL/);
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "Customer_consumerId_key" ON "Customer"("consumerId")');
    expect(migrationSql).toContain('FOREIGN KEY ("consumerId") REFERENCES "Consumer"("id") ON DELETE SET NULL ON UPDATE CASCADE');
    expect(migrationSql).not.toMatch(/DROP\s/i);
    expect(migrationSql).not.toMatch(/DELETE\s+FROM/i);
    expect(migrationSql).not.toMatch(/TRUNCATE/i);
    expect(migrationSql).not.toMatch(/Plant|Equipment|Inverter|IntegrationBinding|AUXSOL|Auxsol/i);
  });

  it('preserva os modelos e declara a relação 1:1 opcional', () => {
    expect(schema).toMatch(/consumerId\s+String\?\s+@unique/);
    expect(schema).toMatch(/consumer\s+Consumer\?\s+@relation\(fields: \[consumerId\], references: \[id\], onDelete: SetNull\)/);
    expect(schema).toMatch(/model Consumer \{[\s\S]*customer\s+Customer\?/);
    expect(schema).toMatch(/model Plant \{/);
    expect(schema).toMatch(/model Equipment \{/);
    expect(schema).toMatch(/model Inverter \{/);
    expect(schema).toMatch(/model IntegrationBinding \{/);
    expect(schema).not.toMatch(/consumerId\s+String\s+@unique/);
  });
});
