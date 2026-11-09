# B7-AUXSOL-COLLECTION-409-01 — Diagnóstico

**Status:** DIAGNÓSTICO CONCLUÍDO (409); 404 sem captura de rede no servidor — hipótese documentada  
**Modo:** somente diagnóstico — código não alterado  
**Data:** 2026-11-08  

---

## 1. Causa raiz do HTTP 409

**Condição:** falha ao adquirir o lock de coleta do inversor `cmw76di320001tyys55mvm5ex`.

Em `IntegrationCollectionService.collectInverter`:

```ts
const key = `collect-lock:${inverterId}`;
const token = this.redis ? await this.acquireDistributedLock(key) : null;
if (this.redis ? !token : !this.lock.tryAcquire(inverterId)) throw concurrentCollection();
```

`concurrentCollection()` → `CollectionError('CONCURRENT_COLLECTION', 'Já existe uma coleta em andamento para este inversor.', 409)`.

Com Redis ativo (`b7-solar-redis` Running), o lock é **distribuído** (`SET NX PX`, TTL default 30s via `MONITORING_COLLECTION_LOCK_TTL_MS`).

### Gatilhos comprovados / altamente prováveis

| # | Gatilho | Evidência |
|---|---|---|
| A | **Segunda chamada HTTP** para o mesmo `inverterId` enquanto a primeira ainda segura o lock | Teste unitário `impede coleta concorrente`; frontend sem dedupe |
| B | **React Strict Mode** (`apps/web/next.config.ts` → `reactStrictMode: true`) + `useEffect(() => load())` + `load` → `loadLiveReadings` → `POST collect` | Em dev, mount duplo dispara duas coletas quase simultâneas |
| C | **Botão Atualizar** (`page.tsx` ~400) enquanto coleta anterior ou job agendado ainda roda | Mesmo caminho `load()` → collect |
| D | **Scheduler** (`MONITORING_COLLECTION_ENABLED=true`, intervalo 300s) enfileira `COLLECT_INVERTER` para o mesmo inversor; worker chama o **mesmo** `collectInverter` e compete pelo Redis lock | Logs: `job started` / `reason: 'SCHEDULED'` para `cmw76di320001tyys55mvm5ex` intercalados com collects manuais |

**Não é** falha da AUXSOL: o 409 ocorre **antes** de `execute()` / adapter quando o lock não é obtido.

A primeira requisição (que ganhou o lock) **pode** alcançar o AuxsolAdapter; a que recebe 409 **não**.

---

## 2. Causa raiz do HTTP 404

**Não há registro de 404** nos logs da API em `terminals/347003.txt` no período inspecionado (coletas AUXSOL 200 / success).

Portanto a URL/método exatos do 404 **não foram confirmados por log de servidor** nesta sprint.

### Hipóteses independentes do 409 (não associar automaticamente)

| Hipótese | Método / URL candidata | Origem | Notas |
|---|---|---|---|
| H1 | `GET /api/plants/:id` ou monitoring com id inválido | `load()` / history | `NotFoundException('Usina não encontrada.')` / inversor |
| H2 | Recurso Next (asset/rota) em `:3000` | Browser | Sem rewrite `/api` no `next.config.ts`; API é `:3001` |
| H3 | `GET /api/auth/me` com sessão inválida costuma ser 401, não 404 | AuthProvider | Improvável |
| H4 | Collect com inverterId inexistente | `NotFoundException('Inversor não encontrado.')` | Ulisses SN existe e logs mostram collect success — **improvável** para este id |

**Conclusão 404:** independente do 409 na evidência disponível; **EVIDÊNCIA INSUFICIENTE** para URL/corpo sem HAR/DevTools Network.

---

## 3. Corpo da resposta 409 (efetivo)

`CollectionError` monta `{ ok: false, code: 'CONCURRENT_COLLECTION', message, error, statusCode: 409 }`, mas o **`HttpExceptionFilter` global reescreve** o JSON:

```json
{
  "statusCode": 409,
  "code": "HTTP_ERROR",
  "message": "Já existe uma coleta em andamento para este inversor.",
  "path": "/api/integrations/collect/cmw76di320001tyys55mvm5ex",
  "requestId": "<uuid>"
}
```

Observação: o código semântico `CONCURRENT_COLLECTION` **não** chega ao cliente; o filter usa `HTTP_ERROR` para status ≠ 404/5xx.

`fetchApi` propaga `ApiError(409, message)` com a mensagem acima.

---

## 4. Corpo da resposta 404

Não capturado. Formato esperado pelo mesmo filter:

```json
{
  "statusCode": 404,
  "code": "RESOURCE_NOT_FOUND",
  "message": "<mensagem NotFoundException>",
  "path": "<url>",
  "requestId": "<uuid>"
}
```

---

## 5. Arquivos envolvidos

| Arquivo | Papel |
|---|---|
| `collection.controller.ts` | `POST /api/integrations/collect/:inverterId` |
| `integration.collection.service.ts` | Lock Redis/in-process → `concurrentCollection()` |
| `collection.errors.ts` | Definição 409 / mensagem |
| `collection.lock.ts` | Lock in-process (fallback sem Redis) |
| `redis.connection.ts` | `acquireLock` / `releaseLock` |
| `integration-collection.scheduler.ts` | Tick agendado |
| `integration-queue.processor.ts` | Worker → `collectInverter` (mesmo lock) |
| `http-exception.filter.ts` | Corpo HTTP efetivo |
| `apps/web/.../usinas/[id]/page.tsx` | `loadLiveReadings` + botão Atualizar |
| `apps/web/next.config.ts` | `reactStrictMode: true` |
| `apps/web/src/lib/api.ts` | Stack frame ~22 (`fetch`) |

---

## 6. Fluxo completo da coleta manual

```
UI Atualizar / mount
  → load()
  → GET /plants/:id
  → void loadLiveReadings(plant)
       → POST /api/integrations/collect/:inverterId   (SETTINGS_VIEW)
            → acquireLock(collect-lock:{id})
                 ├─ fail → 409 CONCURRENT_COLLECTION (não chama AUXSOL)
                 └─ ok → execute()
                      → Prisma inverter+binding
                      → AuxsolAdapter.collect (GET realtime SN — leitura)
                      → lastSyncAt (persist OFF)
                      → NÃO evaluateAfterCollection (COERENCIA-03)
                      → releaseLock
  → GET monitoring history + diagnostics (paralelo)
```

Frontend engole erro do collect (`catch → null`), então 409 aparece no Network mas a UI mostra “leitura indisponível” se todas falharem.

---

## 7. A chamada 409 alcança o adapter AUXSOL?

**Não.** Lock falhou → throw antes de `execute()`.

A requisição **vencedora** do lock (irmã da 409) tipicamente alcança; logs recentes mostram `realtimeBySn` 200 + `collect` success para o mesmo inverterId.

---

## 8. Concorrência com scheduler?

**Sim, possível e evidenciada nos logs.**

- `MONITORING_COLLECTION_ENABLED=true`
- Intervalo 300s
- Worker e HTTP manual compartilham `collect-lock:{inverterId}`
- `CONCURRENT_COLLECTION` **não** está em `NON_RETRYABLE` → job agendado que toma 409 **pode retentar**, alongando contenção

Duplicata de enqueue (`skipped: DUPLICATE`) mitiga jobs idênticos na fila, mas **não** impede overlap HTTP manual × job já em `active`.

---

## 9. Correção recomendada (NÃO implementar nesta sprint)

1. **Frontend:** dedupe/in-flight guard por `inverterId`; evitar double-invoke em Strict Mode (ref/AbortController compartilhado; não disparar segundo collect se um já está pendente).  
2. **UX:** no 409, tratar como “coleta em andamento” (retry curto ou reutilizar resultado), não como falha definitiva de telemetria.  
3. **Opcional API:** incluir `CONCURRENT_COLLECTION` em `NON_RETRYABLE` no worker; ou fazer HTTP manual enfileirar em vez de competir com o worker.  
4. **Filter:** preservar `code` semântico do `CollectionError` no JSON (hoje vira `HTTP_ERROR`).  
5. **404:** capturar uma linha no DevTools (URL + método + response) numa próxima inspeção controlada.

---

## 10. Riscos de alterar o mecanismo de proteção

| Mudança | Risco |
|---|---|
| Remover lock | Coletas paralelas → race em binding/`lastSyncAt`, pressão na AUXSOL, dados inconsistentes |
| TTL curto demais | Dois collects “válidos” sobrepostos |
| TTL longo / lock órfão | Bloqueio prolongado de Atualizar (mitigado hoje por PX 30s) |
| Só dedupe no FE | Scheduler × manual ainda colidem |
| Só mudar filter | Melhora diagnóstico, não remove 409 |

O lock é **proteção legítima**; o problema é **disparo concorrente** (FE + scheduler), não a existência do lock.

---

## Confirmações de restrição

- AuxsolAdapter / credenciais / binding / cadastro / persistência / alertas: **não alterados**  
- Locks Redis: **não apagados**  
- Sem reset/seed; sem mutação remota AUXSOL além do que já consta nos logs históricos  
- Nenhuma correção de código nesta sprint  

---

## Status final

**DIAGNÓSTICO CONCLUÍDO** para o HTTP 409 (lock `CONCURRENT_COLLECTION`).  

HTTP 404: **não correlacionado** ao 409 na evidência disponível; URL/corpo pendentes de captura de rede (EVIDÊNCIA INSUFICIENTE para o 404 isolado).
