# Sprint 8 — Fundação da Gestão de Energia

## 1. Objetivo

Criar o bounded context **Gestão de Energia** como consumidor somente-leitura de `MonitoringReading`, sem antecipar Rateio, Créditos, Compensação, Balanço definitivo, Faturamento ou Cobrança.

**Gestão de Energia não modifica o domínio de Monitoramento.**

## 2. Baseline

Registrado em `apps/api/reports/sprint8-energy-baseline.json`:

- API/Web health ok (Postgres + Redis)
- Testes API 434 / Web 38
- Lint e build PASS
- Prisma validate PASS
- 12 migrations, schema up to date
- Sem `migrate reset` / `db push` destrutivo

## 3. Auditoria

Registrada em `apps/api/reports/sprint8-energy-audit.json`.

Conclusões:

1. Não existia domínio de Gestão de Energia (apenas README stub + cadastro 4.1 distributors/consumers/UCs).
2. Não existia model energético de competência/período.
3. Cálculo de energia já existe em `monitoring.energy.aggregateEnergyHistory` (dentro do Monitoring).
4. Não existia API `/energy/*`.
5. Não existia tela `/gestao-energia`.
6. `MonitoringReading` é suficiente para a fundação (`energyTodayKwh` / `energyTotalKwh`).
7. Campos consumidos sem alterar schema: `collectedAt`, `energyTodayKwh`, `energyTotalKwh` (agregação); `powerKw` **nunca** convertido em kWh.
8. Sem regras comerciais escondidas no Monitoring.
9. Rateio/crédito/balanço documentados e bloqueados — não implementar neste Sprint.

**Por que não duplicar MonitoringReading?** Podemos consultar/agregar via `MonitoringHistoryService`. Duplicar criaria segundo motor e risco de divergência.

## 4. Decisões reutilizadas

| Decisão | Fonte |
|---------|--------|
| Cadastro energético mínimo (Distributor/Consumer/UC) | domain-spec / 4.1 |
| Rateio versionado — fase posterior | domain-energy-rateio-4.2 / 4.3 BLOCKED |
| Timezone `America/Sao_Paulo` | monitoring.timezone |
| Autorização JWT + permissions + plant scope | AuthorizationService / MonitoringAccessService |
| Ausência ≠ zero | monitoring.energy + formatEnergyKwh |
| Plant permanece operacional | domain decisions — sem campos comerciais no Plant |

## 5. Conceito criado

**Competência energética (consulta)** — representada pelo parâmetro de período da API (`today`, `yesterday`, `last7days`, `thisMonth`, `custom`), **sem tabela persistida**.

Entidade conceitual `EnergyPeriod` **não** foi materializada em Prisma neste Sprint (migration desnecessária).

## 6. Relação com MonitoringReading

```
MONITORAMENTO (MonitoringReading)
        |
        | somente leitura / agregação
        v
GESTÃO DE ENERGIA (EnergyManagementService)
        |
        +-- generation (kWh)
        +-- hasData
        +-- period / timezone
```

Nunca: Energy → altera MonitoringReading / Alert / Collection / Scheduler / AUXSOL.

## 7. Dados recebidos × calculados

| Dado | Origem |
|------|--------|
| `energyTodayKwh` / `energyTotalKwh` | MonitoringReading (recebido/normalizado) |
| `generation.value` (kWh no período) | Calculado por deltas (`aggregateEnergyHistory`) |
| `hasData` | Calculado (existência de deltas/buckets) |
| `powerKw` | **Não usado** como energia |

## 8. Autorização

- Permissão nova: `ENERGY_VIEW` (catálogo de código; sem migration)
- Concedida a: ADMIN, OPERADOR, TECNICO, COMERCIAL, POS_VENDA
- Endpoints exigem JWT + `ENERGY_VIEW`
- Acesso à usina via `MonitoringAccessService.assertPlant` → `AuthorizationService.assertPlantAccess`

## 9. API

- `GET /api/energy/plants/:plantId/summary`
- `GET /api/energy/plants/:plantId/generation` (inclui série)

Resposta sem dados:

```json
{ "hasData": false, "generation": null }
```

Nunca `generation: 0` por ausência de leitura.

## 10. Frontend

- Rota `/gestao-energia`
- Nav item “Gestão de Energia” (grupo Operação)
- Seletor de usina + período
- Estados: carregando / com dados / sem dados / erro / sem permissão
- Display via `formatEnergyKwh(..., hasData)` → “—” quando sem dados

## 11. O que NÃO foi implementado

- Rateio / Allocation
- Créditos / CreditLedger
- Compensação
- Balanço mensal definitivo
- Faturamento / Cobrança / Tarifa / Desconto
- Integração com distribuidora
- Tabela `EnergyPeriod`
- Alterações em José / Ulisses / AUXSOL / bindings

## 12. Testes

- `energy-management.service.spec.ts` — autorização, ausência≠zero, unidade, timezone, isolamento, sem segredos, JWT/ENERGY_VIEW
- Extensão de `permissions.catalog.spec.ts`
- Rota incluída em `customer-screens.spec.ts`

## 13. Banco

- **Nenhuma migration** neste Sprint
- Prisma schema de MonitoringReading intacto
- 12 migrations existentes permanecem controladas

## 14. Impacto sobre AUXSOL

**Nenhum.** Credenciais, discovery, collection, binding e pipeline preservados.

## 15. Próximos passos

1. Definir competência persistida (`EnergyPeriod`) se houver necessidade de workflow/status
2. Fechar modelo jurídico/matemático de Rateio (4.2)
3. Créditos e Compensação após Rateio
4. Balanço mensal oficial
5. Consumo (medição / UC) quando houver fonte autorizada

---

Gestão de Energia não modifica o domínio de Monitoramento.
