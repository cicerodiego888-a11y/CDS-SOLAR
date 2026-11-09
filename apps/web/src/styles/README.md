# Design Tokens V2

Fonte centralizada: `apps/web/src/styles/tokens.css` (importada por `globals.css`).

## Uso

Preferir tokens semânticos:

- `var(--color-text-primary)` em vez de hex
- `var(--color-surface-raised)` para superfícies elevadas
- `var(--space-4)`, `var(--radius-md)`, `var(--shadow-sm)`

Aliases legados (`--bg`, `--text`, `--muted`, `--primary`, …) permanecem válidos até a migração gradual das telas/componentes.

## Escopo

Este arquivo é somente fundação. Aplicação em Button/Select/tabelas/telas ocorre em Sprints seguintes.
