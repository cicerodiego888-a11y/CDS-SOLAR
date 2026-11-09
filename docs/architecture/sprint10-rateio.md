# Sprint 10 — Motor de Rateio Versionado + Tela de Alocação

## 1. Objetivo

Persistir o domínio de **Rateio** como regra versionada de distribuição percentual Plant → ConsumerUnits, com histórico imutável e tela operacional de Alocação — sem calcular kWh, compensação, crédito, saldo ou faturamento.

**Rateio representa uma regra de distribuição. Não representa, por si só, energia compensada, crédito ou saldo.**

## 2. Referências

- Código B7 + `domain-energy-rateio-4.2.md` (autoridade)
- Sprints 7–9, domain-spec V2.1 / decisions V2.2, UC D3, legacy audit
- Lumi PDF: **referência funcional apenas** (experiência de alocação)

## 3. Auditoria

Ver `apps/api/reports/sprint10-rateio-audit.json`.

Antes deste Sprint: nenhum Rateio/Allocation no Prisma; `Plant.consumerUnit` legacy; `Plant.consumerUnitId` opcional (≠ Rateio).

## 4. Conceito Rateio

Composição versionada por **Plant**:

`EnergyRateioVersion` (cabeçalho Vn) + `EnergyRateioLine` (UC + Consumer + %)

## 5. Relacionamentos

```
Plant 1──N EnergyRateioVersion 1──N EnergyRateioLine
                                      ├── ConsumerUnit
                                      └── Consumer (deve = UC.consumerId)
```

**Não** usa `Plant.consumerUnit` (legacy).

## 6. Percentual

- `Decimal(7,4)` no PostgreSQL
- Validação em escala inteira (×10 000) — evita float
- Regra operacional B7: **Σ = 100%** por versão
- Exemplos: `40+35+25`, `33.33+33.33+33.34`

## 7. Vigência

- Intervalo semiaberto `[validFrom, validTo)`
- `validTo = null` → vigência aberta
- `derivedStatus`: ACTIVE | SCHEDULED | EXPIRED | CANCELLED

## 8. Histórico

Alteração = **nova versão**. Versões anteriores preservadas. Sem DELETE físico; cancelamento soft (`CANCELLED`) só para vigências não históricas encerradas.

## 9. Regra de 100%

Validada no backend (`assertPercentagesSum100`). Frontend mostra total como UX; não é autoridade.

## 10. Sobreposição

Rejeitada por Plant entre versões `ACTIVE` (`ConflictException`), com fechamento atômico da versão aberta anterior quando criando a seguinte.

## 11. API

| Método | Rota | Permissão |
|--------|------|-----------|
| GET | `/api/energy/plants/:plantId/rateios` | ENERGY_VIEW |
| GET | `.../rateios/current?at=` | ENERGY_VIEW |
| GET | `.../rateios/history` | ENERGY_VIEW |
| POST | `.../rateios` | ENERGY_UPDATE |
| POST | `.../rateios/:id/new-version` | ENERGY_UPDATE |
| POST | `.../rateios/:id/cancel` | ENERGY_UPDATE |

Transação Prisma + `SELECT … FOR UPDATE` na Plant.

## 12. Autorização

- Leitura: `ENERGY_VIEW` + `assertPlant`
- Mutação: `ENERGY_UPDATE` (ADMIN, OPERADOR, COMERCIAL)
- TECNICO / portal: sem `ENERGY_UPDATE`

## 13. Frontend

`/gestao-energia/rateios` — tabela UC/Consumidor/%/vigência/status + colunas futuras Consumo/Compensado/Crédito/Saldo como **—**.

Nav: Rateio. Link a partir de Gestão de Energia.

## 14. Referência Lumi

Usada para orientar visão de Alocação Usina/Consumidor/UC e colunas futuras.

**Não** usada como especificação técnica, código, regra regulatória, contábil ou fórmula.

## 15. O que NÃO foi implementado

kWh alocado · compensação · créditos · saldo · economia · faturamento · modalidade regulatória enum · migração legacy · rateio automático José/Ulisses

## 16. Migration

`20260926170000_energy_rateio_versioned` — aditiva, não destrutiva, 13 migrations totais.

## 17. Testes

`rateio.percentage.spec.ts`, `rateio.service.spec.ts` — 100%, vigência, sobreposição, histórico V1/V2, Consumer≠UC, JWT/ENERGY_*, sem kWh/crédito.

## 18. Dados reais

José/Ulisses intocados. Sem rateio automático.

## 19. AUXSOL / Monitoring

Intactos.

## 20. Próximo Sprint

Sprint 11 — Créditos + Compensação (após consumo real + rateio vigente).
