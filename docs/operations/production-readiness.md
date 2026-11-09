# Production readiness do Monitoramento Web V1

## Escopo

Esta sprint faz hardening da aplicação existente. Não cria novo motor de alertas, histórico, disponibilidade, diagnóstico, coleta ou integração. Não cria entidades de incidente e não executa migrations.

## Requisitos de ambiente

Obrigatórios:

- `DATABASE_URL` apontando para PostgreSQL;
- `JWT_SECRET` e `JWT_REFRESH_SECRET` fortes em produção (≥32 caracteres, sem defaults/exemplos); a API falha na inicialização se ausentes ou inseguros;
- `CORS_ORIGINS` explícito, sem `*` quando credenciais estão habilitadas;
- Redis disponível em `REDIS_HOST`, `REDIS_PORT` e `REDIS_PASSWORD` quando configurado.

O arquivo `.env.example` contém somente valores de desenvolvimento e nenhum segredo real. `AUXSOL` continua `BLOCKED`; fabricantes externos não são requisito de readiness.

## Health e readiness

- `GET /api/health` mantém o diagnóstico detalhado de API, banco, Redis e modo das integrações.
- `GET /api/health/live` verifica somente que o processo responde.
- `GET /api/health/ready` exige PostgreSQL e Redis disponíveis e retorna `503` quando uma dependência obrigatória falha.

O bloqueio de fabricante não degrada a saúde da infraestrutura.

## Segurança e erros

O bootstrap valida segredo JWT em produção, rejeita CORS wildcard em produção, aplica validação estrita de DTOs, adiciona `X-Request-Id` e usa resposta de erro consistente sem stack trace. Segredos, tokens e senhas não são enviados ao frontend.

As permissões e o isolamento `CUSTOMER` continuam sendo controlados pelos guards e `MonitoringAccessService`. Rate limiting Redis-backed foi aplicado a login, ações de alerta e coleta, com limites configuráveis no ambiente; polling de monitoramento não é limitado.

## Coleta e idempotência

BullMQ mantém três tentativas com backoff exponencial. Erros não recuperáveis de integração continuam sem retry conforme as regras existentes. A persistência agora trata uma violação única concorrente como leitura já persistida, preservando a idempotência. A coleta usa lock Redis-backed com TTL e token de proprietário quando Redis está disponível; se Redis estiver indisponível, a coleta falha controladamente.

## E2E

Foi criada uma suíte nativa do Node em `tests/e2e/`, cobrindo autenticação, monitoramento, diagnósticos, alertas, operações e controle de acesso. Ela usa `fetch`, não instala dependências adicionais e nunca executa reset. O Compose isolado está em `docker-compose.e2e.yml`; os comandos `e2e:up`, `e2e:migrate`, `e2e:seed`, `e2e:run` e `e2e:down` usam PostgreSQL `b7_solar_e2e` e Redis em portas próprias.

Execute com `E2E_BASE_URL`, `E2E_EMAIL` e `E2E_PASSWORD` configurados. Sem `E2E_BASE_URL`, os testes ficam pulados explicitamente. A execução desta sprint sem um ambiente E2E isolado não constitui aprovação dos fluxos HTTP reais.

## Docker, banco e backup

O Compose existente mantém PostgreSQL e Redis com volumes e healthchecks. Não foram alterados volumes nem credenciais existentes. Antes de produção, devem ser definidos backup do PostgreSQL, HTTPS, domínio, rotação de segredos, política de firewall e observabilidade externa. Backup e deploy real não fazem parte desta sprint.

## Checklist

- [ ] `DATABASE_URL` de produção configurada
- [ ] `JWT_SECRET` e `JWT_REFRESH_SECRET` fortes e fora do código
- [ ] `CORS_ORIGINS` explícito
- [ ] PostgreSQL saudável
- [ ] Redis saudável
- [ ] `/api/health/live` OK
- [ ] `/api/health/ready` OK
- [ ] migrations revisadas e aplicadas pelo processo de deploy
- [ ] testes unitários e builds OK
- [ ] E2E executado em ambiente isolado
- [ ] logs sem segredos
- [ ] backup definido
- [ ] AUXSOL somente após contrato e credenciais oficiais

## Limitações reais

O Compose E2E foi criado, mas a execução local desta sprint foi bloqueada porque o Docker Desktop Linux engine não estava ativo. Portanto, ainda não há evidência de E2E HTTP real, backup/restore E2E ou validação de múltiplas réplicas. HTTPS, backup externo e observabilidade externa continuam dependências de infraestrutura de produção. Não declarar o Monitoramento Web como pronto para produção sem executar essas etapas no ambiente alvo.