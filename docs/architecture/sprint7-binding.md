# Sprint 7 — Vínculo oficial e Central operacional

## 1. Objetivo

Fechar a camada Cadastro → Identidade externa → IntegrationBinding → Validação do fabricante → Diagnóstico → Central operacional, sem Gestão de Energia e sem alterar núcleo de Monitoring/Collector/Alert Engine.

## 2. Estado anterior

Sprint 6 entregou Central da Usina e estados operacionais, mas **não havia API de produto** para criar/validar IntegrationBinding (somente script de discovery). José permanece TARGET_NOT_FOUND no escopo AUXSOL.

## 3. Auditoria

Relatório: `apps/api/reports/sprint7-binding-audit.json`.

Respostas-chave:

| # | Pergunta | Resposta pré-sprint |
|---|---|---|
| 1–4 | CRUD API binding | Não existia |
| 5–6 | Validação fabricante antes do bind | Só no script |
| 8–9 | Permission + escopo | N/A → agora SETTINGS_VIEW\|INVERTERS_UPDATE + assertPlantAccess |
| 15–17 | Riscos duplicata/usina errada | Parcial → agora bloqueados na API |

## 4. API de binding

Rotas (Nest):

- `GET /api/inverters/:inverterId/integration-binding`
- `POST /api/inverters/:inverterId/integration-binding/validate`
- `POST /api/inverters/:inverterId/integration-binding`
- `DELETE /api/inverters/:inverterId/integration-binding`

Permissões: leitura `INVERTERS_VIEW|SETTINGS_VIEW`; mutação `INVERTERS_UPDATE|SETTINGS_VIEW`.  
Escopo: `AuthorizationService.assertPlantAccess`.  
Resposta: **nunca** inclui `secretRef`/token/APP_SECRET.

## 5. Fluxo de validação

1. Operador informa `lookupKey` (SN ou ID oficial).
2. AUXSOL live: inventário `listPlants` + `getInvertersByPlant`.
3. Match exato por SN ou inverterId — **sem fallback** de outro serial.
4. `TARGET_NOT_FOUND` → mensagem humana; **nenhum binding**.
5. Create **sempre revalida**; `externalId` = inverterId oficial AUXSOL; serial em `externalMeta`.
6. Conflito se o mesmo `externalId` já estiver em outro inversor; conflito se serial B7 ≠ SN fabricante.

## 6–8. Identidades e estados

- Local: `Inverter.serialNumber`
- Externa: `IntegrationBinding.externalId`
- Estados Sprint 6 reutilizados (NOT_CONFIGURED … ERROR), threshold 900s.

## 9. UX

- Detalhe do inversor: Validar → Confirmar vínculo / Remover.
- Lista de usinas: filtro por estado operacional + potência/última leitura/alertas (via overview).
- Dashboard: card de integração (aguardando identificação / dados / sem com.).

## 10. Autorização

Binding protegido por permission + escopo de usina.  
`GET /alerts` sem membership permanece dívida arquitetural (CUSTOMER sem ALERTS_VIEW).

## 11. AUXSOL

Não alterado. José validate esperado: TARGET_NOT_FOUND. Ulisses sem inversor no B7 — sem binding. Circuit breaker/cooldown: MISSING / futuro.

## 12. Testes

Cobertura unitária: create válido, sem lookupKey, TARGET_NOT_FOUND, duplicata, fabricante incompatível, escopo, secretRef ausente, remoção, estados, inventário SN.

## 13. Limitações

- Validação live depende de inventário AUXSOL no escopo do APP_ID.
- Sem histórico de auditoria de binding (tabela dedicada).
- Zero migration.

## 14. Próximos passos

1. Quando José entrar no escopo: Validar SN → Confirmar vínculo → `AUXSOL_PERSIST_READINGS` → leituras.
2. API de binding já preparada; não inventar externalId.
3. Hardening: circuit breaker/cooldown; membership em alerts se portal expandir.
