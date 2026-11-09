# Sprint 11 — Motor de Alocação Energética (kWh)

## Objetivo

Transformar **geração real da usina** + **rateio versionado** em **energia alocada por UC (kWh)**.

**Este Sprint implementa apenas ALOCAÇÃO ENERGÉTICA.**  
**Compensação, Créditos, Saldo e Faturamento permanecem fora do escopo.**

## Problema resolvido

O Rateio (Sprint 10) define *quem recebe quanto em %*.  
Este Sprint calcula *quanto em kWh* cada UC recebe no período, sem inventar geração.

## Fonte da geração

- `MonitoringHistoryService.compute` → `aggregateEnergyHistory`
- Campos: `energyTotalKwh` (preferencial) / `energyTodayKwh`
- Unidade: **kWh**
- **Não** usa `powerKw` nem fórmula kW×tempo

## Relação com Monitoring

Somente leitura. MonitoringReading / Collection / Scheduler / Alert / AUXSOL **intactos**.

## Relação com Rateio

`EnergyRateioVersion` + `EnergyRateioLine` (ACTIVE, vigência `[validFrom, validTo)`).  
`Plant.consumerUnit` legado **não** é usado.

## Fórmula

```
allocatedKwh = generationKwh × percentage / 100
```

Aritmética em escala inteira (mili-kWh × percentual×10⁴). Resto de truncamento na última linha → Σ alocado = geração.

## Timezone

`America/Sao_Paulo` via `monitoringTimeZone()` / `parseQuery` do MonitoringHistory.

## Precisão

Percentual `Decimal(7,4)` · energia 3 casas · testes 40/35/25 e 33.33/33.33/33.34.

## Ausência ≠ zero

| Caso | Resultado |
|------|-----------|
| Sem leituras (`hasData=false`) | `generationKwh=null`, `allocations=[]` |
| Geração zero real (`hasData=true`, 0) | alocações 0 kWh |
| Sem rateio ACTIVE | `hasData=false`, mensagem NO_RATEIO |

## Versionamento / histórico

Período segmentado pelos limites das versões ACTIVE. Cada segmento agrega geração e aplica o rateio daquele intervalo. Resposta inclui `segments[]` com `rateioVersionId` / label.

## Persistência

**Não persistida.** Read-model calculado sob demanda (determinístico e reproduzível). Sem migration neste Sprint.

## API

`GET /api/energy/plants/:plantId/allocations`  
JWT + `ENERGY_VIEW` + `assertPlant`

## Autorização

Mesmo padrão do Energy Management.

## Invariantes

- Σ% = 100% por versão (senão 422)
- Σ allocatedKwh = generationKwh (por segmento / total)
- percentage ∈ (0, 100]
- generationKwh ≥ 0 quando hasData

## Limitações

- Sem congelamento mensal persistido
- Consumo/compensação/crédito não entram
- Sem geração AUXSOL real → UI mostra ausência

## Próximos passos

Sprint 12+ — Créditos / Compensação / Balanço (após consumo real quando aplicável)
