# B7-MONITORAMENTO-COERENCIA-02 — Auditoria

**Status final:** CORREÇÃO NECESSÁRIA  
**Modo:** AUDITORIA (sem alteração de comportamento em produção)  
**Data:** 2026-11-08  

Nenhuma alteração foi aplicada em `alert.engine.ts`, `IntegrationCollectionService` (fluxo de resolução), AuxsolAdapter, cadastros, bindings, schema ou alertas persistidos.  
Aguardando aprovação explícita antes de qualquer correção funcional.

---

## 1. Resolução automática de alertas

### 1.1 Causa técnica

A sprint COERENCIA-01 passou a chamar `evaluateAfterCollection` em **toda** coleta com leitura válida, inclusive com `AUXSOL_PERSIST_READINGS=false`.

Em `MonitoringAlertService.evaluateAfterCollection`:

```ts
if (context.readingValid && context.collectedAt) {
  decisions.push({ action: 'resolve', ruleCode: ALERT_RULE.NO_RECENT_READING });
}
```

`apply` → `resolveActive` marca alertas `OPEN`/`ACKNOWLEDGED` como `RESOLVED` com `resolutionType: 'AUTOMATIC'` e `resolvedBy: SYSTEM`.

Isso **conflita** com a restrição da COERENCIA-01: *“Não resolver ou apagar alertas automaticamente nesta sprint”* / *“Preservar histórico e auditoria dos alertas”* no sentido operacional de não fechar alertas existentes como efeito colateral da correção de coerência UI.

### 1.2 Fluxo de execução

```
POST /integrations/collect/:inverterId
  → adapter.collect()
  → valid[0] existe
  → markBinding(lastSyncAt = collectedAt)   // metadado; não é alerta
  → alerts.evaluateAfterCollection({ readingValid: true, collectedAt, ... })
       → regras de status (OFFLINE/WARNING/ERROR/ANOMALY)
       → atalho: resolve NO_RECENT_READING se readingValid && collectedAt
       → apply → resolveActive (OPEN|ACKNOWLEDGED → RESOLVED AUTOMATIC)

Job agendado EVALUATE_ALERTS
  → evaluateAbsenceForEligible()
       → lastReadingAt = readings[0].collectedAt ?? binding.lastSyncAt
       → NoRecentReadingRule:
            recente → action resolve
            ausente/atrasado → action open
```

### 1.3 Condições que provocam resolução

| Caminho | Condição | Efeito |
|---|---|---|
| Pós-coleta | `readingValid && collectedAt` | Resolve `NO_RECENT_READING` **sem** reavaliar a janela da regra |
| Ausência agendada | `lastReadingAt` dentro do threshold | `NoRecentReadingRule` → `resolve` |
| Ausência agendada | sem leitura / fora do threshold + COLLECTABLE | `open` / touch |
| Manual API | `POST/PATCH acknowledge|resolve` | Fora do escopo desta auditoria |

### 1.4 Estados possíveis

`OPEN` → `ACKNOWLEDGED` → `RESOLVED`  
Ativos elegíveis a resolução automática: **OPEN**, **ACKNOWLEDGED**.  
`RESOLVED` não é reaberto pelo atalho; nova ausência cria/atualiza por fingerprint.

### 1.5 Evidência (testes)

Arquivo: `alert-resolution.audit.spec.ts`

| Caso | Resultado |
|---|---|
| OPEN + coleta válida | **RESOLVED AUTOMATIC** |
| ACKNOWLEDGED + coleta válida | **RESOLVED AUTOMATIC** |
| readingValid=false | permanece OPEN |
| evaluateAbsence com lastReadingAt recente | RESOLVED |

**5/5 pass** — comportamento de resolução automática **comprovado**.

### 1.6 Compatibilidade com o contrato anterior

| Contrato | Situação |
|---|---|
| Motor histórico já resolvia NO_RECENT após coleta **persistida** | Compatível com o desenho original do engine |
| COERENCIA-01: não resolver alertas automaticamente na sprint | **Violado** pela extensão do evaluateAfterCollection ao caminho live sem persistência |
| COERENCIA-01: alinhar regra à fonte ao vivo | Intenção válida; mecanismo escolhido = auto-resolve |

### 1.7 Necessidade de correção

**SIM.**

### 1.8 Correção proposta (aguardando aprovação)

**Opção A (recomendada — coerência sem fechar alertas legados na mesma entrega):**  
No `IntegrationCollectionService`, quando `!runtime.persistable`, **não** chamar `evaluateAfterCollection` (voltar ao gate `persistable`), mantendo apenas `lastSyncAt` + UI. A ausência agendada usaria `lastSyncAt` (após correção do ponto 2) para não reabrir falsos positivos, sem resolver alertas já abertos nesta etapa.

**Opção B:** Manter avaliação pós-coleta live, mas no atalho de `NO_RECENT_READING` **não** emitir `resolve` quando `persisted === false` / flag `suppressAutoResolve`; só `skip`. Alertas existentes permanecem até ação manual ou política futura.

**Opção C:** Aceitar resolução automática como contrato definitivo (documentar e remover a restrição). Só se o PO autorizar explicitamente.

Nenhuma opção foi implementada.

---

## 2. Precedência de timestamps

### 2.1 Causa técnica

Produção em `evaluateAbsenceForEligible`:

```ts
const lastReadingAt = inverter.readings[0]?.collectedAt
  ?? binding?.lastSyncAt
  ?? null;
```

`readings` já vem `orderBy collectedAt desc take 1` **do próprio inversor**.  
O operador `??` **prioriza qualquer persistido não-nulo**, mesmo que seja antigo, e **descarta** um `lastSyncAt` mais recente da coleta ao vivo sem persistência.

Cenário crítico:

- `MonitoringReading.collectedAt` = outubro (antigo, persistido em janela passada)
- `binding.lastSyncAt` = agora (coleta live OK, persist OFF)
- Resultado atual = outubro → `NO_RECENT_READING` abre/mantém indevidamente

### 2.2 Arquivos envolvidos

- `apps/api/src/modules/alerts/alert.engine.ts` (produção — **não alterado**)
- `apps/api/src/modules/alerts/last-observation-at.ts` (**proposta**; **não ligado** ao motor)
- `apps/api/src/modules/alerts/last-observation-at.audit.spec.ts`
- Coleta que grava `lastSyncAt`: `integration.collection.service.ts` (sem mudança nesta sprint)

### 2.3 Resultado dos testes direcionados

Arquivo: `last-observation-at.audit.spec.ts` — **7/7 pass**

| # | Cenário | Seletor atual (`??`) | Proposta (max válido) |
|---|---|---|---|
| 1 | Histórico antigo + lastSyncAt recente | usa **antigo** | usa **recente** |
| 2 | Histórico recente + lastSyncAt antigo | recente | recente |
| 3 | Sem histórico + lastSyncAt válido | lastSyncAt | lastSyncAt |
| 4 | Ausência dos dois | null | null |
| 5 | Inválido / futuro indevido | rejeita / fallback | rejeita / fallback |
| 6 | Isolamento entre inversores | por `inverterId` | por `inverterId` |

Evidência adicional: com threshold 900s, o seletor atual no cenário 1 classificaria ausência; a proposta não.

### 2.4 Necessidade de correção

**SIM.**

### 2.5 Correção proposta (aguardando aprovação)

1. Adotar `selectLastObservationAtProposed` (mais recente entre `collectedAt` e `lastSyncAt` válidos do **mesmo** inversor/binding).
2. Ligar em `evaluateAbsenceForEligible` no lugar do `??`.
3. Rejeitar timestamps inválidos e futuros além de skew configurável (ex.: 5 min).
4. Não misturar leituras/bindings de outro inversor (já garantido pelo loop por inversor; reforçar no helper).

**Não implementar até aprovação.**

---

## 3. Confirmações de preservação

| Item | Status |
|---|---|
| AuxsolAdapter | Intact |
| Credenciais / secrets | Intact |
| Bindings / cadastros Ulisses–José | Intact (nenhuma mutação DB de negócio) |
| `AUXSOL_PERSIST_READINGS` | OFF (não ativado) |
| Mutações AUXSOL remotas | Não executadas |
| Alertas existentes em produção | **Não** resolvidos/reconhecidos/apagados nesta auditoria |
| Seed / reset / limpeza | Não executados |
| Schema | Não alterado |
| Motor de alertas em runtime | **Comportamento inalterado** |

Artefatos novos (somente auditoria/proposta):

- `alert-resolution.audit.spec.ts`
- `last-observation-at.ts` (proposta não wired)
- `last-observation-at.audit.spec.ts`
- este relatório

---

## 4. Testes executados

```
alert-resolution.audit.spec.ts     5 pass
last-observation-at.audit.spec.ts  7 pass
Total                              12 pass / 0 fail
```

---

## 5. Status final

**CORREÇÃO NECESSÁRIA**

Dois achados bloqueiam encerrar só como “auditoria limpa”:

1. Coleta ao vivo válida **resolve automaticamente** `NO_RECENT_READING` ativos — incompatível com a restrição da COERENCIA-01.  
2. `collectedAt ?? lastSyncAt` **prefere histórico antigo** a sync recente — risco de falso positivo de ausência.

**Próximo passo:** aprovação do PO/produto entre Opções A/B/C (alertas) + ligar seletor “mais recente válido” (timestamps). Sem aprovação, nenhuma mudança de comportamento.
