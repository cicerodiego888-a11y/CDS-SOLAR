# Integrações

A primeira integração real será implementada **somente** após contrato e documentação oficiais do fabricante.

Enquanto isso não existir, AUXSOL permanece `BLOCKED` e os demais fabricantes usam `PlannedManufacturerAdapter`. Nenhum endpoint, payload, credencial ou protocolo é inventado.

## Fluxo oficial

```
Fabricante
    ↓
Transport
    ↓
Client
    ↓
Adapter
    ↓
IntegrationEngine
    ↓
IntegrationCollectionService
    ↓
ReadingValidator
    ↓
MonitoringPersistenceService
    ↓
MonitoringReading
    ↓
MonitoringAlertService
    ↓
Histórico
    ↓
Central de Operação
    ↓
Dashboard
```

Cada fabricante futuro segue o mesmo contrato interno:

```
FABRICANTE → {Fabricante}Adapter → MonitoringConnector → IntegrationEngine
```

## Estados

| Estado | Significado |
| --- | --- |
| `BLOCKED` | Sem contrato/credencial/configuração necessária para coleta real |
| `NOT_CONFIGURED` | Sem `IntegrationBinding` suficiente |
| `READY` / `CONFIGURED` | Configuração válida para tentar comunicação |
| `COLLECTING` | Coleta em andamento (fila/lock) |
| `ERROR` | Tentativa real falhou de forma controlada |

`BLOCKED` não é `OFFLINE` e não gera `INVERTER_OFFLINE`.

## Vínculo

Cliente → Usina → Inversor interno → `IntegrationBinding` → identificador externo.

Não há tabela paralela por fabricante.

## Segredos

```
Browser → API B7 → Integration Service → SecretProvider → Manufacturer Client → Fabricante
```

O frontend nunca chama o fabricante. Respostas HTTP e logs não incluem token, secret ou API key.

Variáveis AUXSOL usadas hoje: `AUXSOL_API_BASE_URL`, `AUXSOL_APP_ID`, `AUXSOL_APP_SECRET`, `AUXSOL_SECRET_REF`, `AUXSOL_API_TIMEOUT_MS`, `AUXSOL_HTTP_MAX_RETRIES`, `AUXSOL_TOKEN_REFRESH_MARGIN_MS`, `AUXSOL_MOCK_MODE`, `AUXSOL_ALLOW_MOCK_IN_PRODUCTION`, `AUXSOL_PERSIST_READINGS`.

Credencial atual destinada à validação técnica. Deve ser substituída por credencial própria/rotacionada antes da entrada em produção. Nunca colocar `APP_SECRET` no código, no Git ou em logs.

## Documentos

- [Contrato oficial (template)](./manufacturer-contract.md)
- [Normalização](./normalization.md)
- [Motor de Coleta](./collection.md)
- [Fila](./queue.md)
- [AUXSOL](./auxsol.md)
