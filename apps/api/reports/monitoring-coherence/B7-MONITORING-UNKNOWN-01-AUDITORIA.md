# B7-MONITORING-UNKNOWN-01 — Auditoria da origem do UNKNOWN

**Status:** AUDITORIA, SEM ALTERAÇÕES  
**Data:** 2026-11-08  
**Alvo:** inversor Ulisses Lima (`ASN-10SL251016000352` / `cmw76di320001tyys55mvm5ex` / plant `cmucots7g0007tymccjpscinm`)  
**Método:** somente evidências já capturadas (sem nova coleta remota, sem alteração de código/banco).

---

## 1. Evidência AUXSOL já disponível (sanitizada)

Fontes:
- `apps/api/reports/auxsol-access-diagnostic-1794101762182.json` (realtime Ulisses)
- `apps/api/reports/ulisses-realtime-1794103234033.json` (collect → liveReading)
- Código: `auxsol.normalizer.ts`, `live-reading.view.ts`, `monitoring.availability.ts`, `monitoring.persistence.service.ts`

### Endpoint
`GET /analysis/inverterReport/findInverterRealTimeInfoBySn/ASN-10SL251016000352`  
HTTP 200 · `code=AWX-0000` · `data` = objeto

### Campos de estado / conexão / alarmes no payload

| Campo AUXSOL | Papel | Situação no Ulisses (evidência) |
|---|---|---|
| `data.status` | Estado operacional do inversor (contrato oficial) | **Chave presente** em `dataKeys` do access-diagnostic. **Valor numérico/exato não foi materializado** no relatório sanitizado. Captura live (`ulisses-realtime`) projetou `equipmentStatus: null` → naquele snapshot o valor estava `null`/`undefined` **ou** não chegou à view. |
| `data.lastCommTime` / `data.lastDeviceCommTime` | Última comunicação | Presente: `2026-11-08T04:29:39.636+08:00` (sanitizado) |
| `data.dt` | Timestamp da amostra de energia | Presente: `2026-11-07 17:29:39` (access) / coletado como ISO no live |
| `data.energyData.power/y/ym/yt` | Potência / geração | Presentes (ex.: power `0`, y `69.32`, ym `457.53`, yt `5768.11`) |
| `data.alarmCurrent.*` | Alarmes/falhas | Presente; todos zerados / nulos → “Sem alarmes reportados.” |
| `data.communication` | (candidato) | Listado em preview de discovery; **não** confirmado com valor no relatório Ulisses |

**Não confundir** com `status: "02"` da **listagem de usinas** no mesmo diagnostic — esse é status de **planta**, não do inversor realtime.

Valor típico documentado em teste unitário da view (`live-reading.view.spec.ts`): `data.status = "1"`. Isso ilustra o formato (código string/numérico), **não** prova o valor do Ulisses na captura live com `equipmentStatus: null`.

---

## 2. Caminho dos dados (onde cada UI lê)

```
AUXSOL realtime (data.status, energyData, alarmCurrent, lastCommTime, dt)
    → AuxsolAdapter.collect (live)
    → normalizeAuxsolRealtime()          ★ atribui status = 'UNKNOWN' (fixo)
    → IntegrationEngine / CollectionService
    → buildLiveReadingView()
         · status          ← reading.status (= UNKNOWN)
         · equipmentStatus ← rawPayload.data.status (string ou null)
    → (se persist) rawPayload.normalizedStatus ← reading.status (= UNKNOWN)
    → disponibilidade: extractStoredStatus(rawPayload) → lastObservedStatus
    → diagnóstico: evidence.normalizedStatus ← extractStoredStatus(...)
    → UI (rótulo pt-BR de UNKNOWN → “Não identificado”)
```

---

## 3. Onde UNKNOWN é produzido (comprovado)

### Local exato

`apps/api/src/modules/integrations/auxsol/auxsol.normalizer.ts` → função `normalizeAuxsolRealtime`:

```ts
status: 'UNKNOWN',
communicationOk: true,
```

Comentário do próprio módulo: mapeia energia/`dt` 1:1 e **não** deriva status de `faultCode`/`alarmCode`. Também **não** lê `data.status`.

Teste que fixa o comportamento (`auxsol.normalizer.spec.ts`):

> contrato oficial realtime → `expect(reading.status).toBe('UNKNOWN')`

### O que o normalizador de fixtures faz (contraste)

`normalizeAuxsolFixture` usa `normalizeAuxsolStatus(device.statusCode)` com mapa textual:

`running/online → ONLINE`, `offline → OFFLINE`, `warning → WARNING`, `fault/error → ERROR`, ausente/outro → `UNKNOWN`.

Esse mapa **não** é aplicado ao contrato oficial live. Códigos numéricos (`"1"`, `"02"`) **também não** entram no `STATUS_MAP`.

---

## 4. Campo consumido pelo CDS vs campo AUXSOL

| UI | Campo CDS | Origem | Valor observado Ulisses |
|---|---|---|---|
| Estado do equipamento | `liveReading.status` (prioritário) + `equipmentStatus` | `reading.status` hardcoded UNKNOWN; auxiliar `data.status` | `status=UNKNOWN`; `equipmentStatus=null` na captura live |
| Status normalizado (diagnóstico) | `evidence.normalizedStatus` | `extractStoredStatus(rawPayload)` → `rawPayload.normalizedStatus` gravado na persistência como `reading.status` | `UNKNOWN` (quando há leitura persistida com esse payload) |
| Status observado (disponibilidade) | `lastObservedStatus` | `extractStoredStatus` → `resolveObservedStatus` | `UNKNOWN` |

`extractStoredStatus` só aceita `normalizedStatus` ou `status` já no enum `ONLINE|OFFLINE|WARNING|ERROR|UNKNOWN`. **Ignora** o `data.status` numérico bruto da AUXSOL dentro do envelope (`rawPayload.data.status`).

Observação: no diagnóstico, se `extractStoredStatus` retornasse `undefined`, o fallback seria `communicationOk ? ONLINE : OFFLINE`. Como a persistência grava `normalizedStatus: 'UNKNOWN'`, o fallback **não** é alcançado — UNKNOWN prevalece.

---

## 5. Comparação AUXSOL × CDS

| Aspecto | AUXSOL (evidência) | CDS |
|---|---|---|
| Telemetria de energia | Presente e válida | Exibida (kW/kWh) |
| Comunicação | `lastCommTime` presente; `communicationOk: true` | Comunicação OK / Online operacional |
| Alarmes | Todos zero | “Sem alarmes reportados.” |
| Estado operacional | Campo `data.status` existe no contrato; valor não mapeado pelo normalizador live | **UNKNOWN** / “Não identificado” |

Conclusão comparativa: o CDS **recebe** telemetria e comunicação, mas **descarta** o campo de estado do contrato oficial na normalização live, substituindo-o por UNKNOWN de propósito (comportamento conservador / incompleto — não é falha de rede AUXSOL).

---

## 6. Causa raiz comprovada

1. **Causa primária:** `normalizeAuxsolRealtime` atribui **literalmente** `status: 'UNKNOWN'` e não consome `data.status` da AUXSOL.  
2. **Propagação:** esse valor vira `liveReading.status`, `rawPayload.normalizedStatus` (persistência) e, via `extractStoredStatus`, o **status normalizado** e o **status observado**.  
3. **Causa secundária (mapa):** mesmo que `data.status` fosse passado a `normalizeAuxsolStatus`, o mapa atual só reconhece strings (`running`, `offline`, …), não códigos numéricos tipicamente retornados pela AUXSOL.  
4. **Não é:** falha de autenticação, allowlist, Redis lock, ausência de telemetria, nem conversão indevida UNKNOWN→ONLINE na UI.

---

## 7. Correção recomendada (NÃO implementada nesta etapa)

1. Obter/confirmar na documentação oficial AUXSOL a tabela de códigos de `data.status` (ex.: significado de `"1"`, `"02"`, etc.).  
2. Em `normalizeAuxsolRealtime`, mapear `data.status` → `NormalizedStatus` com tabela **explícita e testada**; manter `UNKNOWN` só para ausente/não mapeado.  
3. **Não** inferir ONLINE/OFFLINE a partir de potência, `communicationOk` ou alarmes sem contrato.  
4. Garantir que `rawPayload.normalizedStatus` continue espelhando o status normalizado (já feito na persistência).  
5. Cobrir com testes: código conhecido → enum; código desconhecido → UNKNOWN; payload sem `status` → UNKNOWN.  
6. Revalidar Ulisses após correção: Estado / Normalizado / Observado alinhados ao código AUXSOL documentado.

---

## 8. Pendências de evidência

- Valor exato de `data.status` do Ulisses **não** foi salvo no JSON sanitizado do access-diagnostic (só a chave).  
- Captura live mostrou `equipmentStatus: null` — investigar em sprint de correção se o valor veio nulo da AUXSOL naquele instante ou se houve outra perda no envelope (sem nova coleta nesta auditoria).

---

## Preservações desta etapa

- Nenhum código funcional alterado  
- Nenhuma coleta remota nova  
- Sem mudança de banco, persistência, alertas, allowlist ou AuxsolAdapter  
- UNKNOWN **não** foi transformado em ONLINE/OFFLINE
