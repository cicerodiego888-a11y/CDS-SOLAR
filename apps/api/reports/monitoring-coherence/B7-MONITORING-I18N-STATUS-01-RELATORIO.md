# B7-MONITORING-I18N-STATUS-01 — Relatório

**Status:** CONCLUÍDA  
**Escopo:** apenas apresentação pt-BR dos estados de monitoramento (sem alteração do motor, persistência, Redis, AUXSOL, allowlist ou alertas).

## Causa

Telas de usina/inversor renderizavam enums técnicos crus (`ONLINE`, `UNKNOWN`, `HEALTHY`, `ACTIVE`, `NO_DATA`, etc.) e rótulos legados divergentes (`Desconhecido`, `Atenção`, `Erro`, `N/D`).

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `apps/web/src/lib/status-labels.ts` | Normalizador centralizado pt-BR |
| `apps/web/src/lib/status-labels.spec.ts` | Testes direcionados do mapeamento |
| `apps/web/src/constants/inverters.ts` | Delega rótulos ao normalizador |
| `apps/web/src/lib/format.ts` | `N/D` → `Não disponível` |
| `apps/web/src/lib/operations-center.ts` | `operationsStatusLabel` centralizado |
| `apps/web/src/lib/operational.ts` | WARNING/OFFLINE da usina alinhados |
| `apps/web/src/lib/integration-status.ts` | ERROR → `Com erro` |
| `apps/web/src/lib/plant-integration-state.ts` | Filtro/label ERROR → `Com erro` |
| `apps/web/src/lib/monitoring-coherence.ts` | Resumo de comunicação ERROR → `Com erro` |
| `apps/web/src/app/inversores/[id]/page.tsx` | Estado, diagnóstico, normalizado, observado, timeline |
| `apps/web/src/app/usinas/[id]/page.tsx` | Badge de saúde do diagnóstico |
| `apps/web/src/app/alertas/page.tsx` | Filtro WARNING → `Em atenção` |
| `apps/web/src/app/operacao/page.tsx` | Placeholder de potência |
| `packages/types/src/index.ts` | Labels compartilhados alinhados |
| Specs de availability/coherence | Expectativas `Não disponível` |

## Mapeamento completo implementado

### Status normalizado / observado / operacional
| Interno | Apresentação |
|---|---|
| ONLINE | Online |
| OFFLINE | Offline |
| WARNING | Em atenção |
| ERROR | Com erro |
| UNKNOWN | Não identificado |
| (vazio / N/D) | Não disponível |
| (token desconhecido) | Não identificado |

### Saúde operacional
| Interno | Apresentação |
|---|---|
| HEALTHY | Saudável |
| ATTENTION | Atenção |
| CRITICAL | Crítico |
| NO_DATA | Sem dados |

### Diagnóstico (status)
| Interno | Apresentação |
|---|---|
| ACTIVE | Ativo |
| ATTENTION | Atenção |
| NO_DATA | Sem dados |

### Alertas
| Interno | Apresentação |
|---|---|
| OPEN / ACKNOWLEDGED / RESOLVED | Aberto / Reconhecido / Resolvido |
| INFO / WARNING / CRITICAL | Informação / Em atenção / Crítico |

### Motivos de disponibilidade (subset)
OK, NO_DATA, INTEGRATION_BLOCKED, INTEGRATION_NOT_CONFIGURED, NOT_SUPPORTED, INACTIVE, NO_ELIGIBLE_INVERTERS, LIVE_OBSERVATION — todos com rótulo pt-BR no normalizador.

### Timeline de diagnóstico
READ, ALERT_OPENED, ALERT_ACKNOWLEDGED, ALERT_RESOLVED — rótulos pt-BR.

## Telas corrigidas

- Página do inversor (estado do equipamento, status do diagnóstico, status normalizado, status observado, timeline)
- Página da usina (badge de saúde do diagnóstico operacional)
- Central de operação / alertas (rótulos via helpers centralizados)
- Disponibilidade / cobertura (`Não disponível` no lugar de `N/D`)
- Histórico: sem enums de status crus (painel já era energético)

## Testes

```
pnpm --filter @b7/web exec node --experimental-strip-types --test \
  src/lib/status-labels.spec.ts \
  src/lib/availability.spec.ts \
  src/lib/monitoring-coherence.spec.ts \
  src/lib/operations-center.spec.ts \
  src/lib/integration-status.spec.ts \
  src/lib/plant-integration-state.spec.ts
```

**Resultado:** 35/35 pass.

## Enums ainda sem tradução dedicada (fora do escopo de monitoramento de equipamento)

- Health de infra da API (`ok` / `down` / `degraded`) na Central de Operação — já tem frase agregada quando `ok`.
- `derivedStatus` de rateios (gestão de energia), fora do domínio de monitoramento.
- Códigos numéricos brutos AUXSOL (`equipmentStatus` = `"1"`): não são inventados como ONLINE/OFFLINE; UI mostra **Não identificado** quando só o código bruto existe; o status normalizado continua sendo a fonte de apresentação.

## Preservações

- Valores internos AUXSOL/backend inalterados
- Sem mudança em normalização operacional, persistência, Redis, allowlist, motor de alertas ou adaptador AUXSOL
- Cores/tones (`getStatusTone` / `StatusBadge status=`) continuam baseados no enum interno
