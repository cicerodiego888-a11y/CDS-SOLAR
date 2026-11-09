import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = readFileSync(join(root, 'styles/tokens.css'), 'utf8');
const globals = readFileSync(join(root, 'app/globals.css'), 'utf8');

function hasToken(name: string) {
  return new RegExp(`--${name}\\s*:`).test(tokens);
}

describe('design tokens V2', () => {
  it('globals.css importa a fonte centralizada de tokens', () => {
    assert.match(globals, /@import\s+["']\.\.\/styles\/tokens\.css["']/);
  });

  it('define tokens semânticos de página, superfície e texto', () => {
    for (const name of [
      'color-bg-page',
      'color-bg-sidebar',
      'color-bg-topbar',
      'color-surface',
      'color-surface-raised',
      'color-surface-hover',
      'color-surface-active',
      'color-surface-disabled',
      'color-text-primary',
      'color-text-secondary',
      'color-text-tertiary',
      'color-text-disabled',
      'color-text-placeholder',
      'color-text-inverse',
    ]) {
      assert.equal(hasToken(name), true, `missing --${name}`);
    }
  });

  it('define bordas, brand, estados e foco', () => {
    for (const name of [
      'color-border',
      'color-border-subtle',
      'color-border-strong',
      'color-border-focus',
      'color-brand-primary',
      'color-brand-primary-hover',
      'color-brand-secondary',
      'color-success',
      'color-success-bg',
      'color-warning',
      'color-warning-bg',
      'color-danger',
      'color-danger-bg',
      'color-info',
      'color-info-bg',
      'focus-ring',
    ]) {
      assert.equal(hasToken(name), true, `missing --${name}`);
    }
  });

  it('define tipografia, spacing, radius, shadows, motion e z-index', () => {
    for (const name of [
      'font-family-sans',
      'font-size-xs',
      'font-size-sm',
      'font-size-md',
      'font-size-lg',
      'font-size-xl',
      'font-size-2xl',
      'font-size-3xl',
      'font-weight-regular',
      'font-weight-medium',
      'font-weight-semibold',
      'font-weight-bold',
      'space-1',
      'space-8',
      'space-10',
      'space-12',
      'radius-sm',
      'radius-md',
      'radius-lg',
      'radius-xl',
      'shadow-sm',
      'shadow-md',
      'shadow-lg',
      'duration-fast',
      'duration-normal',
      'z-base',
      'z-dropdown',
      'z-sticky',
      'z-overlay',
      'z-modal',
      'z-toast',
    ]) {
      assert.equal(hasToken(name), true, `missing --${name}`);
    }
  });

  it('mantém aliases legados para compatibilidade gradual', () => {
    for (const name of [
      'bg',
      'text',
      'text-secondary',
      'muted',
      'surface',
      'surface-2',
      'border',
      'primary',
      'success',
      'danger',
      'radius',
      'shadow',
      'focus',
      'ease',
      'font',
    ]) {
      assert.equal(hasToken(name), true, `missing legacy --${name}`);
    }
  });
});
