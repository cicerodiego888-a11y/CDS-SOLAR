# B7-MONITORING-PERSISTENCE-01 — Relatório

**Status:** PARCIAL  
**Data:** 2026-11-08  

Código e testes unitários concluídos; **gravação real no PostgreSQL bloqueada** neste momento porque Docker/Postgres (`localhost:5432`) e API (`:3001`) estão indisponíveis no ambiente.

---

## 1. Auditoria do modelo (Etapa 1)

| Item | Resultado |
|---|---|
| Tabela | `MonitoringReading` (Prisma → PostgreSQL `b7_solar`) |
| Relações | `plantId` → Plant (Cascade); `inverterId` → Inverter (Cascade) |
| Campos | `collectedAt` obrigatório; `powerKw`/`energy*` Decimal opcionais; `communicationOk`; `sourceProvider`; `idempotencyKey` **@unique**; `rawPayload` Json |
| Índices | `[plantId, collectedAt]`, `[inverterId, collectedAt]`, `[inverterId, sourceProvider, collectedAt]` |
| Duplicidade | `idempotencyKey` + lookup `inverterId + (key \| provider+collectedAt)` + catch P2002 |
| Secrets | `sanitizeRawPayload` / `stripSensitiveObject` antes de gravar |
| Histórico | `GET /monitoring/plants/:id/history` via leituras persistidas |
| Schema | **Sem migration** — modelo existente suficiente |

---

## 2. Configuração

| | Anterior | Nova |
|---|---|---|
| `AUXSOL_PERSIST_READINGS` | `false` | `true` |
| `AUXSOL_PERSIST_INVERTER_IDS` | (inexistente) | `cmw76di320001tyys55mvm5ex` |

Proteção: com `PERSIST=true` e **allowlist vazia**, **nada** é gravado (não habilita todos os inversores).

---

## 3. Escopo habilitado

Somente:

- Inverter: `cmw76di320001tyys55mvm5ex` (Ulisses / ASN-10SL251016000352)  
- Plant: `cmucots7g0007tymccjpscinm`  
- José: **fora** da allowlist → coleta live possível, **sem** persistência  

---

## 4. Arquivos modificados

- `collection/auxsol-persist-scope.ts` (+ spec)  
- `collection/integration.collection.service.ts` (+ spec)  
- `collection/monitoring.persistence.service.spec.ts`  
- `collection/collection-alert.integration.spec.ts`  
- `apps/api/.env`, `.env.example`, root `.env.example`  
- `scripts/ulisses-persist-homologation.ts` (homologação quando PG estiver up)  

AuxsolAdapter: **não alterado** (continua `persistable` via env; escopo aplicado no collection service).

---

## 5. Fluxo de persistência efetiva

```
runtime.persistable (AUXSOL_PERSIST_READINGS + live)
  AND inverterId ∈ AUXSOL_PERSIST_INVERTER_IDS
  → MonitoringPersistenceService.persist(...)
  → evaluateAfterCollection (COERENCIA-03, só se persistThis)
```

`lastSyncAt` continua atualizado mesmo sem persistir.

---

## 6. Testes unitários

**36/36 pass** (scope, collection, persistence, alerts COERENCIA-03):

| Cenário | Status |
|---|---|
| J) Persist OFF | pass |
| Allowlist Ulisses / José isolado | pass |
| B) powerKw=0 | pass |
| E) inválida sem gravação | pass |
| D) idempotência / P2002 | pass (persistence spec) |
| Secrets stripped | pass |
| L) lock concorrente | pass |
| COERENCIA-03 alerts | pass |

---

## 7. Evidência PostgreSQL / history endpoint

**Pendente de ambiente:** `PG_DOWN` / `API_DOWN` / Docker daemon indisponível.

Quando o banco estiver no ar:

```bash
cd apps/api
pnpm exec tsx scripts/ulisses-persist-homologation.ts
# depois: GET /monitoring/plants/cmucots7g0007tymccjpscinm/history?period=today
```

---

## 8. Confirmações

| Item | Status |
|---|---|
| Alertas COERENCIA-03 | Preservados (`persistThis` no gate) |
| Redis lock | Preservado |
| Cadastro / binding / externalId | Não alterados |
| Mutação remota AUXSOL | Não implementada (só leitura collect) |
| Secrets em rawPayload | Sanitizados no path de persistência |
| Persistência indiscriminada | Bloqueada por allowlist |

---

## 9. Pendências

1. Subir Docker/`pnpm start:b7` e executar `ulisses-persist-homologation.ts`.  
2. Confirmar linha(s) em `MonitoringReading` e resposta de `GET .../history`.  
3. Validar gráficos UI com dados reais após gravação.  
4. HTTP 404 (sprint UX anterior) permanece separado.

---

## Status final

**PARCIAL** — implementação e testes direcionados prontos; critérios de aceitação de **gravação real + history** aguardam PostgreSQL disponível.
