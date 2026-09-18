# Integração AUXSOL

## Estado atual (Fase 1 + Fase 2)

- **Fase 1:** autenticação LIVE `POST /auth/token`, cache de token, Bearer, timeout, erros 401/429/5xx.
- **Fase 2:** primeira coleta REAL — realtime por SN + normalizer oficial inicial.

A integração AUXSOL **não** está 100% completa. Demais endpoints do PDF permanecem pendentes.

## Fabricante

- Código interno: `AUXSOL`
- Nome: Auxsol
- Status do catálogo: `READY` (adapter registrado; coleta realtime por SN disponível em modo LIVE)

## Mecanismo de integração

Camada `AuxsolClient` → transport:

- `blocked`: padrão quando não há `AUXSOL_API_BASE_URL`.
- `mock`: `AUXSOL_MOCK_MODE=true` (fixtures internas; sem HTTP).
- `live`: `AUXSOL_API_BASE_URL` + credenciais; HTTP real via `fetch` nativo.

## Autenticação

- `POST /auth/token` com `app_id`, `app_secret`, `lang: zh-CN`
- Bearer `ACCESS_TOKEN` cacheado (`AuxsolTokenManager`, margem padrão 60s)
- Credenciais somente no backend: `AUXSOL_APP_ID`, `AUXSOL_APP_SECRET` (ou `AUXSOL_SECRET_REF`)

## Endpoints oficiais utilizados

| Endpoint | Status |
|----------|--------|
| `POST /auth/token` | Implementado (Fase 1) |
| `GET /analysis/inverterReport/findInverterRealTimeInfoBySn/{sn}` | Implementado (Fase 2) |
| `GET /archive/plant/list?current=&size=` | Descoberta read-only (Sprint 2.2) — não persiste |
| `GET /archive/inverter/getInverterByPlant/{plantId}` | Descoberta read-only (Sprint 2.2) — não persiste |
| Demais archive/analysis/collector/histórico | **Não implementados** |

Base URL oficial de validação (somente via `AUXSOL_API_BASE_URL`, nunca hardcoded no Service):

`https://eu.auxsolcloud.com/auxsol-api`

Credencial atual destinada à validação técnica. Deve ser substituída por credencial própria/rotacionada antes da entrada em produção. `APP_SECRET` existe apenas em variável de ambiente local (`AUXSOL_APP_SECRET` ou `AUXSOL_SECRET_REF`).

## Identificadores

- Interno B7: `Inverter.id`
- Fabricante: `manufacturer.code === AUXSOL`
- **SN para realtime:** `Inverter.serialNumber` (obrigatório na coleta LIVE)
- Externo genérico: `IntegrationBinding.externalId` (não usado como SN nesta fase)

## Normalizer (Fase 2)

Mapeamento mínimo (valores 1:1 em kW / kWh conforme campos do PDF):

| AUXSOL | B7 |
|--------|-----|
| `energyData.power` | `powerKw` |
| `energyData.y` | `energyTodayKwh` |
| `energyData.ym` | `energyMonthKwh` |
| `energyData.yt` | `energyTotalKwh` |
| `dt` | `collectedAt` (obrigatório; sem `Date.now()`) |
| envelope + data | `rawPayload` (sanitizado) |

Fixtures MOCK legadas (`powerW` / Wh) continuam convertendo W→kW / Wh→kWh apenas no caminho de fixture interna.

## Persistência

Leituras reais só quando modo `live` **e** `AUXSOL_PERSIST_READINGS=true`, via `IntegrationCollectionService` / `MonitoringPersistenceService`.

## Validação real — AUXSOL 2.1 / 2.1.1

Credencial atual destinada à validação técnica. Deve ser substituída por credencial própria/rotacionada antes da entrada em produção.

| Item | Valor observado |
|------|-----------------|
| Base URL | `https://eu.auxsolcloud.com/auxsol-api` via `AUXSOL_API_BASE_URL` |
| Auth | `POST /auth/token` → HTTP 200, `code=AWX-0000`, `expiresIn=43200` |
| Realtime | `GET /analysis/inverterReport/findInverterRealTimeInfoBySn/{sn}` |
| SN | `ASN-10SL2508230101` (não usar o Gateway como SN) |
| Periodicidade AUXSOL | ~5 min (`MONITORING_COLLECTION_INTERVAL_SECONDS=300`) |
| Persistência nesta validação | `AUXSOL_PERSIST_READINGS=false` |

Estrutura real do envelope (sanitizada):

```json
{
  "code": "AWX-0000",
  "msg": null,
  "data": null
}
```

Chaves do JSON: `code`, `msg`, `data`. Nenhuma chave irmã. `dataKind=null`.

Campos documentados (`sn`, `pId`, `id`, `dt`, `energyData.power/y/ym/yt`, `ratedPower`, `type`, `lastCommTime`, `alarmCurrent`, `batteryData`, `gridData`, `loadData`) **não vieram** neste payload.

Unidades: não confirmadas (não há valores).
Timestamp: não confirmado (não há `dt`).
Normalizer: mantido. `data=null` → lista vazia; nenhum campo é inventado; `Date.now()` não é usado.

Coleta one-shot (sem persistir): `pnpm --filter @b7/api auxsol:validate`.
Descoberta de plantas/inversores (sem persistir): `pnpm --filter @b7/api auxsol:discover`.
Endpoint interno B7: `POST /api/integrations/collect/:inverterId` (ID interno, não o SN).

### Divergências observadas

DOCUMENTAÇÃO:
campo esperado = `data` objeto com `sn`, `pId`, `id`, `dt`, `energyData`

PAYLOAD REAL:
campo recebido = `data: null` (envelope `code/msg/data` apenas)

IMPACTO:
HTTP 200 + `AWX-0000` sem leitura normalizável. Sem `powerKw` / energias / timestamp.

AÇÃO:
Não inventar dados. Persistência OFF. Verificar no lado AUXSOL: usuário, planta, cadastro do inversor, permissão da APP e disponibilidade de telemetria. Não adicionar query params não documentados.

## Pendências explícitas

- Histórico / curvas
- Plant current data / plant detail
- Collectors
- Bateria / grid / load detalhados
- Regras avançadas de alarmes a partir de `alarmCurrent`
- Rate limiting outbound completo
- Rotacionar a credencial de validação antes de produção
- Telemetria realtime do SN `ASN-10SL2508230101` ainda retorna `data=null` na conta de validação
- Confirmação formal de unidades no payload real quando `data` vier preenchido
- Sprint 2.2: APP_ID autenticado vê 10 plantas / 10 inversores; o SN `ASN-10SL2508230101` **não** está nesse escopo (`TARGET_FOUND=false`). Realtime do alvo não foi reconsultado. Diagnóstico **B**.

## Descoberta real — AUXSOL 2.2

Somente leitura. Sem persistência, binding ou migration.

| Item | Valor observado |
| --- | --- |
| Auth | HTTP 200, `AWX-0000`, `mode=live` |
| Plantas | 10 (`GET /archive/plant/list?current=1&size=100`) |
| Inversores | 1 por planta (`GET /archive/inverter/getInverterByPlant/{plantId}`) |
| SN alvo | `ASN-10SL2508230101` — **não encontrado** |
| Gateway alvo | `A012509010791620` — não veio no payload de listagem |
| Realtime do alvo | não executado (SN ausente na listagem) |
| Persistência | `executed=false` |

SNs visíveis neste APP_ID (sanitizado): `ASN-7.5SL251101001356`, `ASN-10SL251016000397`, `ASN-4SL-G2251016000261`, `ASN-6SL-G22507160280`, `ASN-6SL-G22507160137`, `ASN-10SL250924000132`, `ASN-6SL-G2251101001036`, `ASN-5SL-G2251101001022`, `ASN-6SL-G2251101001122`, `ASN-5SL-G2250924000007`.

Há dois `ASN-10SL` no escopo, com SNs diferentes do equipamento do cliente. Ação: verificar no lado AUXSOL se o inversor está na conta/APP correta.

## Variáveis de ambiente

- `AUXSOL_API_BASE_URL`
- `AUXSOL_APP_ID`
- `AUXSOL_APP_SECRET`
- `AUXSOL_SECRET_REF` — nome de env alternativa ao secret
- `AUXSOL_API_TIMEOUT_MS` — padrão 10000
- `AUXSOL_HTTP_MAX_RETRIES` — padrão 2
- `AUXSOL_TOKEN_REFRESH_MARGIN_MS` — padrão 60000
- `AUXSOL_MOCK_MODE`
- `AUXSOL_ALLOW_MOCK_IN_PRODUCTION`
- `AUXSOL_PERSIST_READINGS`
