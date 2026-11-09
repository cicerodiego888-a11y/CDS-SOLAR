# Sprint 9 — Consumo Energético e Base do Balanço

## 1. Objetivo

Fundar o domínio de **consumo energético por ConsumerUnit (UC)**, separado da geração da usina, preparando Rateio, Créditos, Compensação, Balanço Mensal e Faturamento — sem implementá-los ainda.

## 2. Referência funcional da Lumi

O PDF *Apresentação Plataforma Lumi - 2026* **não está versionado no repositório**. Conceitos (balanço mensal por UC, consumo, energia compensada, saldo de créditos, alocação) entram via docs oficiais V2.1/V2.2 **somente como norte funcional**.

**Este Sprint utiliza a apresentação da Lumi como referência funcional, não como especificação técnica ou regulatória do B7 Solar.**

## 3. Decisões do B7

| Decisão | Resultado |
|---------|-----------|
| Geração ≠ Consumo | Obrigatório; teste dedicado |
| Consumo → ConsumerUnit | Nunca Customer / Plant como dono do consumo |
| Sem derivar consumo de MonitoringReading | Aprovado |
| Sem migration neste Sprint | Sem fonte real de ingestão |
| Rateio / Crédito / Compensação / Faturamento | Fora de escopo |
| Timezone | America/Sao_Paulo (reuso monitoring) |
| Autorização | JWT + ENERGY_VIEW + escopo UC/Plant |

## 4. Auditoria

Ver `apps/api/reports/sprint9-consumption-audit.json`.

Resumo: nenhum model/API/cálculo de consumo; MonitoringReading só usina/inversor; risco de confundir geração com consumo mitigado pela API e UI.

## 5. Conceito de consumo

Consulta de **consumo normalizado por UC e período**, com:

- `hasData` / `consumption` (kWh + origin) ou `null`
- `availability: AVAILABLE | UNAVAILABLE`
- Mensagem explícita: **CONSUMO REAL: NÃO DISPONÍVEL**

Porta: `EnergyConsumptionStore` (padrão `UnavailableEnergyConsumptionStore`).

## 6. Relação com ConsumerUnit

```
Customer → Consumer → ConsumerUnit → Consumo Energético (consulta)
```

FK conceitual: `consumerUnitId`. Não usa CPF/CNPJ nem `Plant.consumerUnit` (string legada).

## 7. Relação com Plant

Plant permanece operacional/geração.  
`GET .../plants/:plantId/consumer-units/consumption` lista UCs **vinculadas** (`Plant.consumerUnitId`) e o estado de consumo de cada uma — sem somar geração como consumo.

## 8. Origem dos dados

Fontes futuras: DISTRIBUTOR | METER | IMPORT | MANUAL | OTHER.  
Neste Sprint: origem **indisponível** (store vazio). Fixtures só em testes.

## 9. Recebidos × normalizados × calculados

| Categoria | Sprint 9 |
|-----------|----------|
| Recebidos | Ainda sem ingestão |
| Normalizados | Contrato de resposta pronto; store vazio |
| Calculados | Compensação/crédito/economia/faturamento = NOT_IMPLEMENTED |

## 10. API

- `GET /api/energy/consumer-units/:consumerUnitId/consumption`
- `GET /api/energy/consumer-units/:consumerUnitId/consumption/summary`
- `GET /api/energy/plants/:plantId/consumer-units/consumption`
- `GET /api/energy/consumer-units/:consumerUnitId/balance-foundation`

Sem dados: `{ hasData: false, consumption: null }`.

## 11. Frontend

`/gestao-energia`: cards **Geração da Usina** vs **Consumo das UCs**; seletor de UC; “—” / empty state sem zero falso.

## 12. Autorização

`ENERGY_VIEW` + `assertConsumerUnitAccess` (staff unrestricted; senão customer da Consumer ou plant vinculada).

## 13. Ausência de dados

Ausência ≠ zero. UI usa `formatEnergyKwh(..., hasData)`.

## 14. O que NÃO foi implementado

Rateio, Créditos, Compensação, Balanço definitivo, Faturamento, Cobrança, integração distribuidora, migration `EnergyConsumptionRecord`.

## 15. Impacto futuro no Rateio

Consumo por UC será input do rateio; geração alocada à UC fica `PENDING_RATEIO` no balance-foundation.

## 16. Impacto futuro no Balanço

`balance-foundation` reserva slots: consumption, generationAllocated, compensation, credits, billing, economy.

## 17. Testes

`energy-consumption.service.spec.ts` — UC auth, ausência≠zero, GERAÇÃO≠CONSUMO, stubs, JWT/ENERGY_VIEW, isolamento, origem, José/Ulisses somente leitura.

## 18. Banco

**Nenhuma migration.** 12 migrations existentes intactas.

## 19. AUXSOL

**Nenhum impacto.**

## 20. Próximos passos

1. Ingestão real (import/manual/fatura) + migration `EnergyConsumptionRecord`  
2. Sprint 10 — Rateio Versionado  
3. Créditos + Compensação → Balanço Mensal

---

Gestão de Energia não modifica o domínio de Monitoramento.
