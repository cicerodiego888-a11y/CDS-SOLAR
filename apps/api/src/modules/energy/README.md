# energy — Gestão de Energia (bounded context)

## Sprint 8 — Geração
- `EnergyManagementService` — geração por Plant

## Sprint 9 — Consumo
- `EnergyConsumptionService` — consumo por ConsumerUnit (fonte ainda indisponível)

## Sprint 10 — Rateio versionado
- `RateioService` — `EnergyRateioVersion` + `EnergyRateioLine`
- API `/api/energy/plants/:plantId/rateios*`
- Permissões: `ENERGY_VIEW` (leitura), `ENERGY_UPDATE` (mutação)
- UI `/gestao-energia/rateios`

## Sprint 11 — Alocação (kWh)
- `EnergyAllocationService` — geração × % rateio → kWh por UC (calculado, sem migration)
- `GET /api/energy/plants/:plantId/allocations`

**Este Sprint implementa apenas ALOCAÇÃO ENERGÉTICA.**  
Compensação, Créditos, Saldo e Faturamento permanecem fora do escopo.

**Gestão de Energia não modifica o domínio de Monitoramento.**
