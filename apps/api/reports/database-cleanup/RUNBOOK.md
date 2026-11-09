# Runbook — limpeza de clientes fictícios (B7)

Processo em **duas fases**. Nunca pule a autorização do PO.

## Quando usar
Base local com clientes de teste (ex.: `SPRINT5 CERT*`, `@b7.invalid`) misturados com clientes reais.

## Pré-requisitos
- App apontando para `apps/api/.env` → `DATABASE_URL` (`b7_solar` / Docker `b7-solar-postgres`)
- Docker Postgres no ar
- IDs reais a preservar conhecidos (ou descobertos na auditoria)

---

## Fase 1 — Auditoria (sem DELETE)

```powershell
cd "apps\api"
pnpm exec tsx scripts/database-cleanup-preaudit.ts
```

O script:
1. Inventaria **todos** os `Customer`
2. Classifica PRESERVE / CANDIDATO / REVIEW
3. Gera backup `pg_dump -Fc` via Docker + SHA256
4. Escreve `PRE-DELETION-REPORT.md` + `PLANNED-DELETES.sql`

**Pare aqui.** Envie o relatório ao PO.

### O que o PO deve autorizar
- Lista **exata** de `customerId`s a excluir
- Confirmação dos clientes a preservar (nome + ID)
- Se Consumers/UCs/Distributor de teste entram ou ficam para depois

---

## Fase 2 — Execução (só com autorização explícita)

1. Confira SHA256 do backup no relatório.
2. Cole a lista aprovada no script de execução (hoje: `database-cleanup-execute.ts` — IDs hardcoded da autorização).
3. Rode:

```powershell
cd "apps\api"
pnpm exec tsx scripts/database-cleanup-execute.ts
```

O script:
- Revalida preserve + targets
- `DELETE` ordenado em **transação** (rollback se falhar)
- Valida que só restam os 2 reais
- Smoke `liveReading` do Ulisses (`PERSIST=false`)
- Gera `EXECUTION-REPORT.md`

### Proibido
`TRUNCATE` · `prisma migrate reset` · `seed` · `DROP DATABASE` · CASCADE global · DELETE sem WHERE · mutação AUXSOL

---

## Conferência rápida pós-limpeza

```powershell
cd "apps\api"
pnpm exec tsx scripts/database-cleanup-status.ts
```

Esperado: `customerCount: 2` (Ulisses + José).

---

## Pendência típica (limpeza separada)
Após remover Customers de teste, podem sobrar:
- `Consumer` / `ConsumerUnit` SPRINT5
- `Distributor` SPRINT5

**Não apague** sem nova autorização do PO (podem ter FKs).

---

## Backup / restore de emergência

```powershell
# backup (já feito pelo preaudit via docker)
docker exec b7-solar-postgres pg_dump -U b7 -d b7_solar -Fc -f /tmp/backup.dump
docker cp b7-solar-postgres:/tmp/backup.dump .\backup.dump

# restore (cuidado — sobrescreve)
docker exec -i b7-solar-postgres pg_restore -U b7 -d b7_solar --clean --if-exists < backup.dump
```

---

## Artefatos desta execução
| Fase | Pasta |
|------|-------|
| Pré-exclusão | `reports/database-cleanup/1794104185816/` |
| Execução | `reports/database-cleanup/execute-1794104824291/` |
| Backup | `.../b7_solar-backup-1794104185816.dump` |
