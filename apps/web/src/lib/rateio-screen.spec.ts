import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(srcDir, 'app/gestao-energia/rateios/page.tsx'), 'utf8');
const css = readFileSync(join(srcDir, 'app/globals.css'), 'utf8');

describe('tela de Rateios', () => {
  it('preserva APIs, permissões e navegação', () => {
    assert.match(page, /fetchApi<\{ versions: RateioVersion\[\] \}>\(`\/energy\/plants\/\$\{id\}\/rateios`\)/);
    assert.match(page, /\/energy\/plants\/\$\{plantId\}\/rateios\/\$\{selected\.id\}\/new-version/);
    assert.match(page, /fetchApi\(`\/energy\/plants\/\$\{plantId\}\/rateios`, \{/);
    assert.match(page, /can\(user, 'ENERGY_UPDATE'\)/);
    assert.match(page, /can\(user, 'ENERGY_VIEW'\)/);
    assert.match(page, /href="\/gestao-energia"/);
  });

  it('preserva payload, vigência e percentual como string', () => {
    assert.match(page, /validFrom: new Date\(validFrom\)\.toISOString\(\)/);
    assert.match(page, /validTo: validTo \? new Date\(validTo\)\.toISOString\(\) : null/);
    assert.match(page, /percentage: line\.percentage,/);
    assert.match(page, /timeZone: 'America\/Sao_Paulo'/);
    assert.match(page, /type="datetime-local"/);
  });

  it('preserva a validação existente de 100% sem criar nova', () => {
    const checks = page.match(/Math\.abs\(draftTotal - 100\) > 0\.0001/g) ?? [];
    assert.equal(checks.length, 2);
    assert.match(page, /O rateio deve totalizar 100%\./);
    assert.match(page, /Validação de 100% e sobreposição ocorre no backend\./);
  });

  it('separa versão selecionada do histórico e mantém todas as versões', () => {
    assert.match(page, /Versão selecionada/);
    assert.match(page, /title="Histórico do Rateio"/);
    assert.match(page, /rows=\{versions\}/);
    assert.match(page, /versions\.length > 1/);
    assert.match(page, /\{selected\.totalPercentage\}%/);
    assert.match(page, /\{row\.percentage\}%/);
    assert.match(page, /StatusBadge label=\{selected\.derivedStatus\}/);
    assert.doesNotMatch(page, /\.sort\(/);
  });

  it('selects obrigatórios continuam nativos e sem opção vazia nova', () => {
    assert.match(page, /<select id="rateio-plant"/);
    assert.match(page, /<select id="rateio-version"/);
    assert.match(page, /<option value="">Sem rateio<\/option>/);
    assert.doesNotMatch(page, /style=\{\{/);
    assert.doesNotMatch(page, /#b45309/);
  });

  it('CSS de rateios usa apenas tokens para cores', () => {
    const start = css.indexOf('/* ---- Rateios (Sprint 12.12) ---- */');
    assert.ok(start >= 0);
    const block = css.slice(start, css.indexOf('.auth-loading', start));
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(block, /rgba?\(/);
  });
});
