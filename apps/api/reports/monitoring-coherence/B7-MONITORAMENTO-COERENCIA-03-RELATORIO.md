# B7-MONITORAMENTO-COERENCIA-03 — Relatório final

**Status:** CONCLUÍDA  
**Data:** 2026-11-08  
**Origem:** Auditoria COERENCIA-02 (PO aprovou Opção A + seletor max)

---

## 1. Causa corrigida

1. **Resolução indevida:** coleta live com `persistable=false` chamava `evaluateAfterCollection`, que resolvia `NO_RECENT_READING` automaticamente.  
2. **Timestamp legado:** `collectedAt ?? lastSyncAt` preferia histórico antigo e ignorava `lastSyncAt` mais recente.  
3. **Resolve por sync:** ausência agendada com `lastSyncAt` recente poderia resolver alerta sem leitura persistida — bloqueado na regra.

---

## 2. Arquivos modificados

| Arquivo | Papel |
|---|---|
| `integrations/collection/integration.collection.service.ts` | Gate `runtime.persistable` antes de `evaluateAfterCollection` |
| `alerts/alert.engine.ts` | Usa `selectLastObservationAt`; passa `persistedLastReadingAt` |
| `alerts/alert.types.ts` | Campo `persistedLastReadingAt` |
| `alerts/rules/no-recent-reading.rule.ts` | skip se observação recente sem persistido; resolve só com persistido recente |
| `alerts/last-observation-at.ts` | Seletor oficial (max válido, skew 5 min, isolamento) |
| Specs: `coherence-03-alerts`, `last-observation-at`, collection-alert, alert.engine, alert.rules, auditorias atualizadas | Testes |

**Não alterados:** AuxsolAdapter, schema, cadastros, bindings/externalId, credenciais.

---

## 3. Fluxo anterior × novo

### Anterior (pós COERENCIA-01)
```
collect válido
  → lastSyncAt = collectedAt
  → evaluateAfterCollection SEMPRE
       → resolve NO_RECENT se readingValid
ausência:
  lastReadingAt = persisted ?? lastSyncAt
  → recente ⇒ resolve | atrasado ⇒ open
```

### Novo (COERENCIA-03)
```
collect válido
  → lastSyncAt = collectedAt (sempre)
  → evaluateAfterCollection SOMENTE se persistable=true
       → resolve NO_RECENT (contrato histórico persistido)

ausência agendada:
  lastReadingAt = max(válidos: persisted, lastSyncAt)  // mesmo inversor/binding
  persistedLastReadingAt = persisted
  → observação recente + persistido recente ⇒ resolve
  → observação recente sem persistido (só lastSyncAt) ⇒ skip (não abre, não resolve)
  → observação ausente/atrasada ⇒ open
```

---

## 4. Evidência do gate `persistable`

`integration.collection.service.ts`:

```ts
if (this.alerts && runtime.persistable && valid[0]) {
  await this.alerts.evaluateAfterCollection(...);
}
```

Teste: `Opção A: live válida sem persistência atualiza lastSyncAt e NÃO avalia alertas` — `evaluateAfterCollection.not.toHaveBeenCalled()` + `lastSyncAt` atualizado.

---

## 5. Evidência — lastSyncAt não resolve sozinho

`NoRecentReadingRule`: se `observationRecent && !persistedRecent` → `{ action: 'skip' }`.

Testes:
- `3) lastSyncAt recente impede falso positivo` → skip  
- `4) lastSyncAt recente não resolve alerta existente sozinho` → OPEN permanece  

---

## 6. Evidência do seletor

`selectLastObservationAt` — mais recente entre candidatos válidos; rejeita inválidos e futuros > `now + 5min`; aceita futuro dentro do skew.

Isolamento: `selectLastObservationForInverter` / `selectLastObservationForBinding`.

---

## 7. Resultado dos testes

Suítes direcionadas: **8 suites / 67 testes — todos pass**.

### Alertas (coherence-03-alerts + collection)

| # | Caso | Resultado |
|---|---|---|
| 1 | Live OFF não resolve OPEN (sem eval) | PASS |
| 2 | Live OFF não resolve ACKNOWLEDGED | PASS |
| 3 | lastSyncAt recente → skip (sem falso positivo) | PASS |
| 4 | lastSyncAt recente não resolve existente | PASS |
| 5 | Persistido recente → resolve AUTOMATIC | PASS |
| 6 | Ausente/antiga → open legítimo | PASS |
| 7 | Outros tipos (OFFLINE) intactos na ausência | PASS |
| — | evaluateAfterCollection (persistido) ainda resolve | PASS |

### Timestamps (last-observation-at.spec)

| # | Caso | Resultado |
|---|---|---|
| 1–9 | max, null, inválido, futuro fora/dentro, isolamento inversor/binding | PASS |

---

## 8. Preservação de alertas existentes

- Nenhuma limpeza, acknowledge, resolve manual ou migração executada em dados reais.  
- Motor só altera alertas via caminhos de avaliação já existentes, com proteções novas no caminho live/ausência.

---

## 9. Persistência OFF

`apps/api/.env`: `AUXSOL_PERSIST_READINGS=false` — confirmado; não ativado nesta sprint.

---

## 10. Pendências e limitações

1. Alertas `NO_RECENT_READING` já OPEN na usina Ulisses **permanecem** até resolução manual ou até existir **leitura persistida** recente (com persist OFF, o motor não os fecha automaticamente).  
2. `lastSyncAt` evita novos falsos positivos e renovação via `open`, mas não “cura” alertas legados sozinho — alinhado à proteção do PO.  
3. UI de coerência (COERENCIA-01) permanece independente; histórico continua só com registros persistidos.

---

## Status final

**CONCLUÍDA**
