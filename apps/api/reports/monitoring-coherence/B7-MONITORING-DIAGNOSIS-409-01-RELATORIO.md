# B7-MONITORING-DIAGNOSIS-409-01 — Relatório

**Status:** CONCLUÍDA  
**Data:** 2026-11-08  

---

## 1. Causa raiz comprovada

O stack (linhas ~172 / ~195) aponta para `apps/web/src/app/inversores/[id]/page.tsx`, não para a página da usina.

| Ponto | Comportamento anterior |
|---|---|
| `refreshLiveReading` | `fetchApi(POST /integrations/collect/:id)` **direto** |
| `useEffect` ao carregar binding | Disparava coleta no mount (Strict Mode podia duplicar) |
| `syncNow` / fluxo de diagnóstico | Reutilizava o mesmo `refreshLiveReading` |

Isso **contornava** `collect-inverter.ts` (Promise compartilhada por `inverterId`). Em paralelo com scheduler Redis ou segundo clique → HTTP 409 `CONCURRENT_COLLECTION`, exibido como “Falha de comunicação”.

O botão “Ver diagnóstico” na usina navega para essa tela, que dispara a coleta no efeito.

---

## 2. Correção

1. `refreshLiveReading` → `collectInverterLive(params.id)`.
2. 409 → `COLLECTION_IN_PROGRESS_MESSAGE`; **não** zera a última leitura válida.
3. Guard `liveBootstrappedFor` evita bootstrap duplicado no mesmo `data.id`.
4. `syncNow` ignora clique enquanto `syncing`; trata concurrent.
5. Label de comunicação: “Coleta em andamento” (não falha AUXSOL).

### Horários (investigação separada — corrigida com evidência)

| Campo | Origem | Problema |
|---|---|---|
| Última atualização (`collectedAt`) | `dt` → `parseAuxsolTimestamp` → ISO **UTC** | Formatado em fuso local (BRT = UTC−3) |
| Última comunicação (`lastCommAt`) | `lastCommTime` **string crua** | Browser parseava sem `Z` como **local** |

Diferença típica **3h** (ex.: 13:34 vs 16:34) = UTC vs local, não dois eventos distintos.

**Correção:** `live-reading.view.ts` normaliza `lastCommAt` com a mesma política de `dt` (sem TZ → UTC → ISO).

---

## 3. Arquivos alterados

- `apps/web/src/app/inversores/[id]/page.tsx`
- `apps/web/src/lib/collect-inverter.spec.ts`
- `apps/web/src/lib/inverter-live-timestamps.spec.ts` *(novo)*
- `apps/web/src/lib/inverters-screens.spec.ts`
- `apps/api/src/modules/integrations/collection/live-reading.view.ts`
- `apps/api/src/modules/integrations/collection/live-reading.view.spec.ts`

**Não alterados:** Redis lock, TTL, allowlist, persistência, alertas, AuxsolAdapter, schema.

---

## 4. Comportamento anterior × corrigido

| Antes | Depois |
|---|---|
| Collect fora do dedupe | Collect via Promise compartilhada |
| 409 = falha de comunicação | 409 = “Coleta em andamento…” |
| Leitura apagada no erro | Última leitura válida preservada |
| lastCommAt +3h visual | collectedAt e lastCommAt no mesmo eixo UTC |

---

## 5. Testes

| Suite | Resultado |
|---|---|
| `collect-inverter.spec.ts` (8 + Diagnosticar) | **9 pass** (web: 8+1 no arquivo; total web 9 com timestamps) |
| `inverter-live-timestamps.spec.ts` | **pass** |
| `live-reading.view.spec.ts` | **4 pass** |

Web direcionado: **9/9** · API live-reading: **4/4**.

---

## 6. Pendências

- Nenhuma para o 409 do fluxo de diagnóstico/inversor.
- Homologação visual pós-reload da página do inversor recomendada.

---

## Status final

**CONCLUÍDA**
