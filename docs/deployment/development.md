# Desenvolvimento local

Pré-requisitos:
- Node.js LTS
- pnpm
- Docker Desktop iniciado

Comando oficial:

```
pnpm start:b7
```

Esse comando sobe PostgreSQL e Redis (compose de desenvolvimento), aplica migrations pendentes, gera o Prisma Client se necessário e inicia API + Web.

Não executa seed, não reseta o banco e não derruba os containers ao sair (Ctrl+C).

Passo a passo manual (equivalente):

```
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm db:seed` é opcional e **não** faz parte do `pnpm start:b7`.

API: http://localhost:3001/api/health
Web: http://localhost:3000

## Secrets

**Desenvolvimento:** configure `JWT_SECRET` / `JWT_REFRESH_SECRET` no `.env` local (não versionado). Se `JWT_SECRET` estiver ausente em `NODE_ENV=development`, a API usa um fallback local apenas para desenvolvimento.

**Produção:** `JWT_SECRET` e `JWT_REFRESH_SECRET` são obrigatórios, com tamanho mínimo e sem valores default/exemplo (`dev-secret`, `change-this-in-production`, etc.). A API falha na inicialização se a configuração for insegura.

Credenciais de usuário (login) vêm do banco (seed local opcional). **Não** há senha pré-preenchida no frontend. Não documente nem commite senhas reais.

`AUXSOL_APP_SECRET` e demais secrets vêm apenas de variáveis de ambiente / secret manager — nunca do frontend e nunca do `.env.example` com valor real.
