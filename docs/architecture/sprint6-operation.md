# Sprint 6 — Operação real da usina

## 1. Objetivo

Fechar e certificar o caminho Cadastro → Identidade operacional → Integração → Coleta → Normalização → Monitoramento → Operação → Diagnóstico, sem criar novos domínios (energia/faturamento/CRM/portal/mobile/IA) e sem alterar AUXSOL real, José ou Ulisses.

## 2. Estado anterior

Após a Sprint 5, o cadastro operacional estava certificado. O detalhe da usina já consumia monitoramento/diagnóstico, mas o resumo operacional incompleto (sem potência atual / mês / total com `hasData`), a comunicação e as colunas de integração/última leitura nos inversores não formavam uma “Central da Usina” clara. Estados de integração existiam no enum `IntegrationBindingStatus`, porém sem camada de apresentação unificada dos 6 estados operacionais.

## 3. Auditoria

Relatório: `apps/api/reports/sprint6-operation-audit.json`  
Auditorias auxiliares: [Monitoring/Integration/AUXSOL](ec5023cf-7aaa-4698-8830-fd6e00e3eaf5), [Auth/Frontend/UX](5255ca2f-52e1-4b5f-9ffa-a6010107567e).

Resumo:

- Monitoring, IntegrationEngine, Collector, Normalizer, Alert Engine, Scheduler/BullMQ/Redis: **já existentes e validados** — sem refatoração de núcleo.
- AUXSOL: autenticação/discovery/normalização OK; `data=null` → `[]` (não persiste vazio como sucesso). Live status permanece `UNKNOWN` de propósito (alertas OFFLINE/WARNING/ERROR pouco efetivos no live).
- Binding: schema OK; **sem API HTTP de produto** para create (script discovery/seed). Correto não auto-criar nem copiar serial→externalId.
- Circuit breaker / cooldown de fabricante: **ausentes** (retry Auxsol + BullMQ existem).
- Autorização: monitoring/operations/diagnóstico usam `buildPlantWhere` / `assertPlantAccess`. CRUD de cadastro e `GET /alerts` são permission-only; staff unrestricted por desenho; portal scoped sem essas permissões → sem vazamento atual.
- Frontend: Central da Usina entregue na Sprint 6.

## 4. Problemas encontrados

| Severidade | Item |
|---|---|
| 🔴 CRÍTICO (vazamento atual) | Nenhum — papéis scoped não acessam CRUD unscoped |
| 🔴 BLOQUEIO 1ª usina (ops) | Binding só via script; `AUXSOL_PERSIST_READINGS` necessário; José fora do escopo / sem binding |
| 🟠 IMPORTANTE | Cadastro/alerts sem membership — futuro P0 se portal scoped ganhar `*_VIEW` |
| 🟠 IMPORTANTE | AUXSOL live status/alarmes não operacionalizados |
| 🟡 MELHORIA | Circuit breaker / cooldown; discovery sem UI de produto |
| 🟢 OK / FIXED | Collector empty≠zero; Central da Usina; KPIs plant; estados de apresentação |

## 5. Correções

1. `monitoring.service.plant` — KPIs `currentPowerKw`, `energyToday/Month/Total` com `*HasData`; inversores com binding + última leitura.
2. `monitoring.access.assertPlant` — include `manufacturerRef` + `bindings`.
3. `plants.service` detalhe — include bindings e `equipment.inverter`.
4. `usinas/[id]/page.tsx` — Central da Usina (resumo, inversores, equipamentos, comunicação, alertas, geração).
5. `integration-status.ts` — `resolveOperationalIntegrationState` (apresentação, sem migration).
6. `format.ts` — empty mostra `—` (não zero).

## 6. Estado da integração (regra)

Derivado de dados existentes:

1. **NOT_CONFIGURED** — sem binding
2. **AWAITING_IDENTIFICATION** — binding sem `externalId`
3. **CONFIGURED_AWAITING_DATA** — binding + externalId sem leitura
4. **ONLINE** — leitura recente dentro do threshold (default 900s, alinhado a `NO_RECENT_READING`)
5. **NO_COMMUNICATION** — leitura antiga ou `communicationOk=false`
6. **ERROR** — `AUTH_ERROR` / `COMMUNICATION_ERROR`

## 7. Fluxo de coleta

`Inverter → IntegrationBinding → IntegrationEngine → Adapter.collect → normalize → validateNormalizedReading → persist (se persistable) → MonitoringReading → Alert Engine`

Presentes e validados: retry (Auxsol + BullMQ), lock (in-process/Redis), scheduler, BullMQ, Redis, health.  
Ausentes (documentados, não inventar motor): circuit breaker, cooldown por fabricante, throttle por vendor.  
Persistência live: `AUXSOL_PERSIST_READINGS=true`. Sem mudança de comportamento do núcleo nesta sprint.

## 8. Autorização

- Staff (ADMINISTRADOR, OPERADOR, COMERCIAL, …): unrestricted por desenho.
- Portal (CUSTOMER/INVESTIDOR/CONSUMIDOR): só `DASHBOARD_VIEW` + `MONITORING_VIEW`; monitoring escopado.
- Gap documentado: se um papel scoped ganhar `PLANTS_VIEW`/`ALERTS_VIEW` sem entrar em `STAFF_UNRESTRICTED`, a API de cadastro/alerts vazaria — prioridade futura, não mascarar na UI.

## 9. UX

Central da Usina responde “como está esta usina?” com status, resumo (— sem dado), inversores, equipamentos (com inversor associado), comunicação, alertas e série real de geração.

Diagnóstico detalhado permanece em `/inversores/[id]` (já existente).

## 10. Testes

- Novos: `sumLatestEnergyField` / estados operacionais no web.
- Suíte completa: API + Web + lint + build + prisma validate.
- E2E: `E2E_BLOCKED_ENVIRONMENT` se não houver infra E2E isolada (`E2E_BASE_URL`).

## 11. Pendências

**Bloqueio para primeira usina real**

- Target José fora do escopo discovery atual (`TARGET_NOT_FOUND`).
- Ulisses sem inversor no B7; divergência ASL/ASN pendente (não corrigir automaticamente).
- José sem IntegrationBinding / gateway sem link ao inversor (não inventar binding).
- API HTTP de produto para criar `IntegrationBinding` com `externalId` oficial (hoje: script).
- `AUXSOL_PERSIST_READINGS=true` + Redis para coleta agendada.

**Não bloqueia desenvolvimento**

- Remoção futura dos registros `SPRINT5 CERT` (IDs no audit JSON).
- Escopo membership em CRUD de cadastro/alerts (quando portal scoped expandir permissões).
- Mapeamento oficial de status/alarme AUXSOL live (sem inventar a partir de faultCode).
- Circuit breaker / cooldown.

## 12. Próximos passos

1. Quando AUXSOL disponibilizar a usina no escopo do APP_ID: discovery → identidade oficial → binding (script ou futura API controlada) com `externalId` real → `AUXSOL_PERSIST_READINGS` → MonitoringReading.
2. Não auto-vincular serial → externalId; não criar binding só porque o inversor foi cadastrado.
3. Avaliar escopo membership em cadastro apenas se portal scoped receber permissões de listagem.
4. Só então considerar API de binding de produto e status/alarme AUXSOL com contrato oficial.
