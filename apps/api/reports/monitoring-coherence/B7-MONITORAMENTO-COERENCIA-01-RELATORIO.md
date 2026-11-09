# B7-MONITORAMENTO-COERENCIA-01 — Relatório final

**Status:** CONCLUÍDA  
**Data:** 2026-11-08  
**Escopo:** Coerência entre leitura ao vivo, comunicação, saúde operacional, diagnóstico e histórico.

---

## 1. Diagnóstico da causa raiz

A página da usina consumia **duas fontes desconectadas**:

| Componente | Endpoint / origem | Campo usado |
|---|---|---|
| KPIs + tabela AUXSOL | `POST /integrations/collect/:inverterId` → `liveReading` | `collectedAt`, `powerKw`, `communicationOk` |
| Comunicação (resumo) | `GET /monitoring/plants/:id/history` → `inverters[].lastReadingAt` | leitura **persistida** |
| Saúde / cobertura / observados | `history.availability` + `GET /monitoring/diagnostics/plants/:id` | `MonitoringReading` no DB |
| Histórico | mesmo `history` | apenas persistido |
| Alerta `NO_RECENT_READING` | `evaluateAbsenceForEligible` + `evaluateAfterCollection` | só `readings.collectedAt`; eval pós-coleta **somente se `persistable`** |

Com `AUXSOL_PERSIST_READINGS=false`:

1. Coleta ao vivo válida → tabela “Comunicação OK”.
2. Sem `MonitoringReading` → comunicação “Aguardando dados”, saúde “Sem dados”, cobertura 0%, observados 0.
3. Motor de ausência via só DB → abre “Sem leitura recente”, e a coleta live **não** chamava `evaluateAfterCollection`.

**Diferença de timestamps:** `collectedAt` (coleta B7) ≠ `lastCommAt` (campo fabricante). A UI misturava `collectedAt || lastCommAt` no resumo; o alerta usava só `collectedAt` persistido.

---

## 2. Arquivos modificados (esta sprint)

**Web**

- `apps/web/src/lib/monitoring-coherence.ts` *(novo)*
- `apps/web/src/lib/monitoring-coherence.spec.ts` *(novo — cenários A–F)*
- `apps/web/src/app/usinas/[id]/page.tsx`
- `apps/web/src/lib/format.ts` — cobertura `null/undefined` → `N/D`
- `apps/web/src/lib/availability.ts` / `.spec.ts` — rótulo `LIVE_OBSERVATION`

**API**

- `apps/api/src/modules/integrations/collection/integration.collection.service.ts`
- `apps/api/src/modules/integrations/collection/integration.collection.service.spec.ts`
- `apps/api/src/modules/integrations/collection/collection-alert.integration.spec.ts`
- `apps/api/src/modules/alerts/alert.engine.ts`
- `apps/api/src/modules/alerts/alert.engine.spec.ts`

**Não alterados (restrição):** `auxsol.adapter.ts`, credenciais, bindings, cadastro Ulisses/José, schema.

---

## 3. Resumo das alterações

1. **Overlay de coerência (UI):** leitura ao vivo válida alimenta estado de comunicação, inversores observados e saúde; cobertura/disponibilidade histórica sem evidência persistida → **N/D** (não 0% inventado).
2. **Timestamps:** observação operacional usa `collectedAt`; `lastCommAt` permanece separado.
3. **Coleta:** com leitura válida, atualiza `IntegrationBinding.lastSyncAt` mesmo sem persistir; chama `evaluateAfterCollection` independentemente de `persistable`.
4. **Ausência:** `evaluateAbsenceForEligible` usa `readings[0].collectedAt ?? binding.lastSyncAt`.
5. **Histórico:** inalterado — continua só com leituras persistidas; ausência de histórico não invalida o live.

---

## 4. Endpoints e serviços envolvidos

- `GET /plants/:id`
- `POST /integrations/collect/:inverterId` → `IntegrationCollectionService` + `buildLiveReadingView`
- `GET /monitoring/plants/:id/history` → disponibilidade/KPIs persistidos
- `GET /monitoring/diagnostics/plants/:id`
- `MonitoringAlertService.evaluateAfterCollection` / `evaluateAbsenceForEligible`
- `NoRecentReadingRule` (threshold `MONITORING_NO_READING_THRESHOLD_SECONDS`, default 900s)

---

## 5. Testes executados

| Suite | Resultado |
|---|---|
| `monitoring-coherence.spec.ts` (A–F + comunicação) | **9/9 pass** |
| `availability.spec.ts` | **2/2 pass** |
| `collection-alert.integration.spec.ts` | **pass** (incl. live sem persistência) |
| `alert.engine.spec.ts` | **pass** (incl. lastSyncAt fallback) |
| `integration.collection.service.spec.ts` | **pass** |
| `live-reading.view.spec.ts` | **pass** |

**Total API direcionado:** 29 pass / 0 fail.

---

## 6. Evidência — integração AUXSOL

- `git diff` em `apps/api/src/modules/integrations/auxsol/` → **sem alterações**.
- Nenhuma mutação remota AUXSOL além do fluxo de coleta/leitura já existente.

---

## 7. `AUXSOL_PERSIST_READINGS`

Confirmado em `apps/api/.env`: `AUXSOL_PERSIST_READINGS=false` (permanece OFF).

---

## 8. Cadastro

Nenhuma alteração de Customer/Plant/Inverter/Gateway/IntegrationBinding (externalId) nesta sprint. `lastSyncAt` no binding é atualizado apenas como metadado de sync bem-sucedido (não muda vínculo/identidade).

---

## 9. Alertas

- Nenhum alerta foi apagado/reconhecido/resolvido manualmente.
- Comportamento do motor: coleta live válida passa a avaliar e pode **resolver automaticamente** `NO_RECENT_READING` quando a condição cessa (regra já existente em `evaluateAfterCollection`). Alertas legítimos de ausência real permanecem.

---

## 10. Pendências

1. Alerta `NO_RECENT_READING` já aberto na usina Ulisses só se resolve na **próxima coleta bem-sucedida** (ou ausência com `lastSyncAt` recente) — não foi forçada resolução nesta sprint.
2. Cobertura percentual de período continua exigindo histórico persistido; com persist OFF a UI mostra N/D de forma explícita.
3. Página do inversor / operação central não receberam o mesmo overlay (fora do escopo pontual da usina).

---

## 11. Status final

**CONCLUÍDA** — critérios de aceitação 1–10 atendidos no escopo definido, com testes A–F verdes e restrições preservadas.
