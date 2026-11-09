import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shell = readFileSync(join(root, 'components/layout/AppShell.tsx'), 'utf8');
const globals = readFileSync(join(root, 'app/globals.css'), 'utf8');
const nav = readFileSync(join(root, 'constants/navigation.ts'), 'utf8');

describe('AppShell / shell global', () => {
  it('preserva navegação por NAV_ITEMS e permissões', () => {
    assert.match(shell, /NAV_ITEMS\.filter/);
    assert.match(shell, /can\(user,\s*item\.permission\)/);
    assert.match(shell, /aria-current=\{active \? 'page' : undefined\}/);
    assert.match(nav, /href: '\/gestao-energia'/);
    assert.match(nav, /href: '\/gestao-energia\/rateios'/);
  });

  it('busca do topbar não executa fluxo global', () => {
    assert.match(shell, /function onSearch/);
    assert.match(shell, /event\.preventDefault\(\)/);
    assert.doesNotMatch(shell, /router\.push|fetch\(|\/api\/search/);
  });

  it('notificações e indicador de sistema não inventam fluxo', () => {
    assert.match(shell, /aria-label="Notificações"/);
    assert.match(shell, /shell-system-chip/);
    assert.match(shell, /rótulo estático do produto/);
    assert.doesNotMatch(shell, /\/api\/health|setInterval|poll/i);
  });

  it('CSS do shell usa tokens de página/sidebar/topbar e z-sticky', () => {
    assert.match(globals, /\.sidebar[\s\S]*--color-bg-sidebar/);
    assert.match(globals, /\.topbar[\s\S]*--color-bg-topbar/);
    assert.match(globals, /\.topbar[\s\S]*z-index:\s*var\(--z-sticky\)/);
    assert.match(globals, /\.nav-link\.active[\s\S]*--color-surface-active|--color-brand-energy/);
    assert.match(globals, /\.nav-link:focus-visible/);
    assert.match(globals, /\.icon-btn:focus-visible/);
  });
});
