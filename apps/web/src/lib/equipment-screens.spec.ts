import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_TYPE_OPTIONS, equipmentTypeLabel } from './operational.ts';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(srcDir, 'app/equipamentos/page.tsx'), 'utf8');
const css = readFileSync(join(srcDir, 'app/globals.css'), 'utf8');

describe('tela de equipamentos', () => {
  it('preserva APIs e filtros server-side existentes', () => {
    assert.match(page, /fetchApi<Equipment\[\]>\(`\/equipment/);
    assert.match(page, /fetchApi<Plant\[\]>\('\/plants'\)/);
    assert.match(page, /fetchApi<Inverter\[\]>\('\/inverters'\)/);
    assert.match(page, /query\.set\('plantId', filters\.plantId\)/);
    assert.match(page, /query\.set\('type', filters\.type\)/);
    assert.match(page, /query\.set\('status', filters\.status\)/);
    for (const id of ['eq-usina', 'eq-tipo', 'eq-status']) assert.match(page, new RegExp(`id="${id}"`));
    assert.match(page, /\/equipment\/\$\{row\.id\}\/status/);
  });

  it('preserva colunas da tabela e usa o helper oficial de tipo', () => {
    for (const header of ['Equipamento', 'Tipo', 'Usina', 'Fabricante', 'Modelo', 'Número de série', 'Inversor associado', 'Status', 'Ações']) {
      assert.match(page, new RegExp(`header: '${header}'`));
    }
    assert.match(page, /equipmentTypeLabel\(row\.type\)/);
    assert.equal(equipmentTypeLabel('GATEWAY'), 'Gateway');
    assert.equal(equipmentTypeLabel('MEDIDOR'), 'Medidor');
    assert.equal(equipmentTypeLabel('OUTRO'), 'Outro');
    assert.equal(equipmentTypeLabel(null), '—');
    assert.equal(EQUIPMENT_TYPE_OPTIONS.length, 6);
  });

  it('inversor associado é opcional e sua ausência não é erro', () => {
    assert.match(page, /row\.inverterId\s+\? <Link className="equipment-link" href=\{`\/inversores\/\$\{row\.inverterId\}`\}>/);
    assert.match(page, /: '—',/);
    assert.match(page, /inverterId: linkable \? \(form\.inverterId \|\| null\) : null/);
    assert.match(page, /Um equipamento pode existir sem inversor associado/);
    assert.doesNotMatch(page, /'Sem inversor'|Inversor ausente|StatusBadge[^\n]*inverterId/);
  });

  it('diferencia loading, erro, vazio e filtro sem resultado', () => {
    assert.match(page, /LoadingState message="Carregando equipamentos\.\.\."/);
    assert.match(page, /ErrorMessage message=\{error\}/);
    assert.match(page, /Nenhum equipamento encontrado/);
    assert.match(page, /Não existem equipamentos cadastrados/);
    assert.match(page, /hasActiveFilter/);
  });

  it('aplica o padrão visual e preserva o formulário', () => {
    assert.match(page, /shell equipment-page/);
    assert.match(page, /eyebrow="Ativos"/);
    assert.match(page, /equipment-panel/);
    assert.match(page, /aria-live="polite"/);
    assert.doesNotMatch(page, /style=\{\{/);
    for (const id of ['eq-form-usina', 'eq-form-tipo', 'eq-form-inv', 'eq-fab', 'eq-mod', 'eq-serie', 'eq-obs', 'eq-form-status']) {
      assert.match(page, new RegExp(`id="${id}"`));
    }
    assert.match(page, /plantId: form\.plantId,\s+type: form\.type,\s+manufacturerName: form\.manufacturerName,\s+model: form\.model,\s+serialNumber: form\.serialNumber,/);
  });

  it('CSS de equipamentos usa apenas tokens para cores', () => {
    const start = css.indexOf('/* ---- Equipamentos (Sprint 12.9) ---- */');
    assert.ok(start >= 0);
    const block = css.slice(start, css.indexOf('.auth-loading', start));
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(block, /rgba?\(/);
  });
});
