import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatEnergyKwh } from './format.ts';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(srcDir, 'app/gestao-energia/page.tsx'), 'utf8');
const css = readFileSync(join(srcDir, 'app/globals.css'), 'utf8');

describe('tela de Gestão de Energia', () => {
  it('preserva APIs, permissão e query de período', () => {
    assert.match(page, /\/energy\/plants\/\$\{plantId\}\/summary\?\$\{query\}/);
    assert.match(page, /\/energy\/plants\/\$\{plantId\}\/consumer-units\/consumption\?\$\{query\}/);
    assert.match(page, /\/energy\/plants\/\$\{plantId\}\/allocations\?\$\{query\}/);
    assert.match(page, /fetchApi<PlantOption\[\]>\('\/plants'\)/);
    assert.match(page, /can\(user, 'ENERGY_VIEW'\)/);
    assert.match(page, /new URLSearchParams\(\{ period \}\)/);
    assert.match(page, /params\.set\('startDate', startDate\)/);
    assert.match(page, /params\.set\('endDate', endDate\)/);
    assert.match(page, /href="\/gestao-energia\/rateios"/);
  });

  it('filtros de usina, período e UC não ganham opção vazia nova', () => {
    for (const id of ['energy-plant', 'energy-period', 'energy-uc']) assert.match(page, new RegExp(`<select id="${id}"`));
    assert.doesNotMatch(page, /<SelectField/);
    assert.match(page, /TextField id="energy-start" label="De" type="date"/);
    assert.match(page, /TextField id="energy-end" label="Até" type="date"/);
  });

  it('ausência de dado não vira zero', () => {
    assert.equal(formatEnergyKwh(null, false), '—');
    assert.match(page, /Boolean\(summary\?\.hasData && summary\.generation\)/);
    assert.match(page, /Boolean\(selectedUc\?\.hasData && selectedUc\.consumption\)/);
    assert.match(page, /Isso não significa 0 kWh\./);
    assert.match(page, /Ausência de consumo não significa 0 kWh\./);
    assert.match(page, /CONSUMO REAL: NÃO DISPONÍVEL/);
    assert.match(page, /allocation\?\.hasData\s+\? formatEnergyKwh/);
  });

  it('geração, consumo e alocação continuam conceitos separados', () => {
    assert.match(page, /title="Geração da Usina"/);
    assert.match(page, /title="Consumo das UCs"/);
    assert.match(page, /title="Alocação de Energia"/);
    assert.match(page, /não é derivado da geração da usina/);
    assert.match(page, /Sem compensação, crédito ou saldo\./);
    const withoutDisclaimers = page
      .replace(/Sem créditos, compensação ou faturamento neste estágio\./g, '')
      .replace(/Sem compensação, crédito ou saldo\./g, '');
    assert.doesNotMatch(withoutDisclaimers, /crédito|compensa|saldo|economia|autoconsumo/i);
    assert.doesNotMatch(page, /powerKw/);
  });

  it('remove estilos inline e usa DataTable na alocação', () => {
    assert.doesNotMatch(page, /style=\{\{/);
    assert.match(page, /<DataTable/);
    for (const header of ['UC', 'Consumidor', 'Rateio', 'Alocado']) assert.match(page, new RegExp(`header: '${header}'`));
  });

  it('CSS de energia usa apenas tokens para cores', () => {
    const start = css.indexOf('/* ---- Gestão de Energia (Sprint 12.11) ---- */');
    assert.ok(start >= 0);
    const block = css.slice(start, css.indexOf('.auth-loading', start));
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(block, /rgba?\(/);
  });
});
