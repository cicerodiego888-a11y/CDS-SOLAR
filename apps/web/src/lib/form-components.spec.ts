import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const button = readFileSync(join(root, 'components/ui/Button.tsx'), 'utf8');
const textField = readFileSync(join(root, 'components/ui/TextField.tsx'), 'utf8');
const selectField = readFileSync(join(root, 'components/ui/SelectField.tsx'), 'utf8');
const globals = readFileSync(join(root, 'app/globals.css'), 'utf8');

describe('Button', () => {
  it('renderiza com variantes e type padrão button', () => {
    assert.match(button, /variant\?\s*:\s*'primary'\s*\|\s*'secondary'\s*\|\s*'ghost'\s*\|\s*'danger'/);
    assert.match(button, /type\s*=\s*'button'/);
    assert.match(button, /ui-button-\$\{variant\}/);
  });

  it('preserva type submit quando informado pelo consumidor', () => {
    assert.match(button, /type\s*=\s*\{type\}/);
  });

  it('CSS de button usa tokens e disabled sem opacity genérica', () => {
    assert.match(globals, /\.ui-button-primary[\s\S]*?--color-brand-primary/);
    assert.match(globals, /\.ui-button:disabled[\s\S]*?--color-text-disabled/);
    assert.equal(/\.ui-button:disabled\s*\{[^}]*opacity\s*:/.test(globals), false);
  });
});

describe('TextField', () => {
  it('associa label, value, placeholder, error, hint e disabled', () => {
    assert.match(textField, /htmlFor=\{id\}/);
    assert.match(textField, /placeholder=\{placeholder\}/);
    assert.match(textField, /disabled=\{disabled\}/);
    assert.match(textField, /aria-invalid/);
    assert.match(textField, /aria-describedby=\{describedBy\}/);
    assert.match(textField, /ui-field-hint/);
    assert.match(textField, /ui-field-error/);
    assert.match(textField, /value=\{value\}/);
  });

  it('CSS de campo cobre placeholder, focus e erro com tokens', () => {
    assert.match(globals, /--color-text-placeholder/);
    assert.match(globals, /--color-border-focus/);
    assert.match(globals, /\.ui-field-error[\s\S]*?--color-danger/);
    assert.equal(/\.ui-field input:disabled[^}]*opacity\s*:/.test(globals), false);
  });
});

describe('SelectField', () => {
  it('renderiza label, options, placeholder, disabled e erro', () => {
    assert.match(selectField, /htmlFor=\{id\}/);
    assert.match(selectField, /placeholder\s*=\s*'Selecione'/);
    assert.match(selectField, /options\.map/);
    assert.match(selectField, /disabled=\{disabled\}/);
    assert.match(selectField, /aria-invalid/);
    assert.match(selectField, /aria-describedby=\{describedBy\}/);
    assert.match(selectField, /onChange=\{\(event\)\s*=>\s*onChange\?\.\(event\.target\.value\)\}/);
  });

  it('marca estado vazio do select fechado e usa select nativo', () => {
    assert.match(selectField, /is-placeholder/);
    assert.match(selectField, /<select[\s\S]*<\/select>/);
    assert.doesNotMatch(selectField, /createPortal|Combobox|listbox/i);
  });

  it('CSS do select fechado usa tokens e color-scheme dark', () => {
    assert.match(globals, /\.ui-field select[\s\S]*color-scheme:\s*dark/);
    assert.match(globals, /\.ui-field select\.is-placeholder/);
    assert.match(globals, /--color-text-primary/);
  });
});
