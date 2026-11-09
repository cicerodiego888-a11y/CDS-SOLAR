# B7-AUXSOL-COLLECTION-UX-01 — Relatório final

**Status:** CONCLUÍDA  
**Data:** 2026-11-08  

---

## 1. Causa corrigida

1. Disparos duplicados evitáveis no frontend (Strict Mode / Atualizar / remount) geravam segundo `POST collect` e HTTP 409.  
2. 409 era tratado como falha genérica de leitura ao vivo.  
3. `HttpExceptionFilter` apagava o código `CONCURRENT_COLLECTION` → `HTTP_ERROR`.  
4. Worker podia retentar `CONCURRENT_COLLECTION` (não estava em `NON_RETRYABLE`).

O Redis lock **permanece** como proteção válida.

---

## 2. Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `apps/web/src/lib/collect-inverter.ts` | Dedupe compartilhado por `inverterId` + mapeamento 409 |
| `apps/web/src/lib/collect-inverter.spec.ts` | Testes 1–8 |
| `apps/web/src/lib/api.ts` | `ApiError.code` a partir do body |
| `apps/web/src/app/usinas/[id]/page.tsx` | Usa dedupe; botão Atualizar desabilitado; mensagem 409 |
| `apps/api/src/common/http-exception.filter.ts` | Preserva `code` semântico da exceção |
| `apps/api/src/common/http-exception.filter.spec.ts` | Evidência CONCURRENT_COLLECTION |
| `apps/api/src/modules/integrations/queue/integration-queue.processor.ts` | `CONCURRENT_COLLECTION` em NON_RETRYABLE |
| `apps/api/.../integration-queue.processor.spec.ts` | Testes 9–10 |

---

## 3. Testes executados

| Suite | Resultado |
|---|---|
| `collect-inverter.spec.ts` (7) | **pass** |
| `http-exception.filter.spec.ts` (3) | **pass** |
| `integration-queue.processor.spec.ts` (incl. 9–10) | **pass** |
| `integration.collection.service.spec.ts` (lock 409 concorrente) | **pass** |

**API direcionada:** 21 pass · **Web:** 7 pass.

---

## 4. Evidência de deduplicação

Mapa de módulo `pendingByInverter`: segunda chamada com o mesmo id retorna a **mesma Promise** até `finally` (sucesso ou falha). Remount/Strict Mode não recria o mapa.

---

## 5. Evidência de preservação do lock

Teste existente `impede coleta concorrente no mesmo processo` continua passando (`CONCURRENT_COLLECTION` / 409). Nenhum TTL/Redis lock removido ou alterado.

---

## 6. Evidência do tratamento HTTP 409

`collectInverterLive` → `{ status: 'concurrent', message: 'Coleta em andamento. Aguarde a conclusão.' }`.  
UI: `liveError` com essa mensagem; não usa texto de falha AUXSOL; mantém leitura anterior quando possível.

---

## 7. Evidência do código semântico

Filter responde:

```json
{ "statusCode": 409, "code": "CONCURRENT_COLLECTION", "message": "...", "path": "...", "requestId": "..." }
```

---

## 8. AUXSOL

`AuxsolAdapter` / credenciais / binding / cadastro: **não alterados**.

---

## 9. Persistência OFF

`apps/api/.env`: `AUXSOL_PERSIST_READINGS=false`.

---

## 10. Pendências

1. **HTTP 404** — ainda sem URL/corpo no DevTools; fora desta sprint.  
2. Scheduler continua ativo; conflito residual FE × job `active` ainda pode gerar 409 legítimo (agora bem tratado na UI e sem retry no worker).  
3. Dedupe frontend ≠ lock Redis: coletas de **outro processo** (worker) ainda competem corretamente no Redis.

---

## Status final

**CONCLUÍDA**
