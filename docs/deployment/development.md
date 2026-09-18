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

Credenciais de desenvolvimento:
Diego
pdb100623

Trocar a senha antes de qualquer ambiente real.