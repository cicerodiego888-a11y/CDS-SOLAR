# B7-DATABASE-CLEANUP-02 — Relatório de execução

**Status:** SUCCESS  
**Escopo ampliado:** Não  
**AUXSOL remoto:** Não alterado  

## Backup pré-execução
| Item | Valor |
|------|-------|
| Arquivo | `.../1794104185816/b7_solar-backup-1794104185816.dump` |
| SHA256 | `6e4bd7edd3fe8961e1700b8ec63a3ae3013438535f3fa5f0687d5730fa778d60` |
| Verificado | Sim (bate com o esperado) |

## Antes → Depois

| Antes (6) | Depois (2) |
|-----------|------------|
| Ulisses Lima | **Ulisses Lima** |
| José Bezerra Sobrinho | **José Bezerra Sobrinho** |
| SPRINT5 CERT TESTE EDITADO | — removido |
| SPRINT5 CERT SEM CONSUMER | — removido |
| SPRINT5 CERT OUTRO CONSUMER | — removido |
| SPRINT5 CERT VIA COMERCIAL | — removido |

## Registros excluídos (somente IDs autorizados)

| Tipo | Qtd |
|------|-----|
| Customers | 4 |
| Plants | 3 |
| Inverters | 2 |
| Equipment | 5 |
| Bindings / Readings / Alerts / Users | 0 |

IDs removidos:
- `cmuigi19j0001tyagat7gu92i`
- `cmuigi1b80002tyagumh96ecs`
- `cmuigi1bn0003tyagp4m522ja`
- `cmuigi2as000styag2oa5xo2p`

## Integridade preservada

| Check | Resultado |
|-------|-----------|
| Ulisses `cmucom31o0005tymcu7cgt9d3` | OK |
| Plant Ulisses `cmucots7g0007tymccjpscinm` | OK |
| SN `ASN-10SL251016000352` | OK |
| Binding `cmw76di400003tyys4dhcrfnh` | OK |
| José `cmu7lkkmu0000tyus5j0u824g` | OK |
| Plant José `cmube71va0001tyi0i6d0f8ll` | OK |
| Users / Manufacturers / Distributor / Consumers / UCs | Inalterados |

## Smoke liveReading (Ulisses)
- Fluxo: IntegrationEngine → AuxsolAdapter → GET realtime
- HTTP/AUXSOL: 200 / AWX-0000
- `liveAvailable=true` · `powerKw=0` · `energyTodayKwh=69.32`
- `persisted=0` · leituras no DB = 0

## Observação
Consumers/UCs/distribuidora SPRINT5 permaneceram de propósito (limpeza separada, conforme autorização).
