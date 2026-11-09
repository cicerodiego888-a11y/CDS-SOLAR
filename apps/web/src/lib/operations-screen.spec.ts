import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(srcDir, 'app/operacao/page.tsx'), 'utf8');
const css = readFileSync(join(srcDir, 'app/globals.css'), 'utf8');

describe('tela da Central de Operação', () => {
  it('preserva APIs, polling, permissões e ações de alerta', () => {
    assert.match(page, /\/operations\/overview\?\$\{buildOperationsQuery\(/);
    assert.match(page, /\/monitoring\/diagnostics\/overview\?\$\{diagnosisQuery\.toString\(\)\}/);
    assert.match(page, /fetchApi<Array<\{ id: string; name: string \}>>\('\/customers'\)/);
    assert.match(page, /window\.setInterval\(\(\) => void load\(\), DASHBOARD_POLL_MS\)/);
    assert.match(page, /can\(user, 'MONITORING_VIEW'\)/);
    assert.match(page, /can\(user, 'ALERTS_RESOLVE'\)/);
    assert.match(page, /\/alerts\/\$\{id\}\/\$\{action\}/);
  });

  it('preserva todos os filtros existentes', () => {
    for (const id of ['op-period', 'op-status', 'op-customer', 'op-search', 'diagnosis-plant', 'diagnosis-manufacturer', 'diagnosis-filter']) {
      assert.match(page, new RegExp(`id="${id}"`));
    }
    assert.match(page, /onClick=\{\(\) => setAppliedSearch\(search\)\}/);
    assert.match(page, /Filtros gerais/);
    assert.match(page, /Filtros de incidentes/);
  });

  it('mantém indicadores existentes sem criar novos', () => {
    const cards = page.match(/<MetricCard /g) ?? [];
    assert.equal(cards.length, 6);
    for (const field of ['plants', 'plantsOnline', 'plantsWarning', 'plantsOffline', 'inverters', 'openAlerts']) {
      assert.match(page, new RegExp(`data\\.summary\\.${field}\\}`));
    }
  });

  it('organiza as seções na ordem atenção → usinas → diagnóstico → histórico', () => {
    const order = ['Alertas prioritários', 'Inversores com atenção', 'Situação das usinas', 'Incidentes Operacionais', 'Atualizações recentes']
      .map((title) => page.indexOf(`title="${title}"`));
    assert.ok(order.every((index) => index > 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });

  it('preserva estados de loading, erro e vazio', () => {
    assert.match(page, /loading && !data \? <LoadingState message=\{OPERATIONS_LOADING\} \/>/);
    assert.match(page, /<ErrorMessage title=\{OPERATIONS_ERROR\} message=\{error\} onAction=/);
    assert.match(page, /OPERATIONS_EMPTY_PLANTS/);
    assert.match(page, /OPERATIONS_EMPTY_ALERTS/);
    assert.match(page, /OPERATIONS_EMPTY_ISSUES/);
    assert.match(page, /Nenhum incidente operacional ativo\./);
    assert.match(page, /Nenhuma leitura disponível\./);
    assert.doesNotMatch(page, /style=\{\{/);
  });

  it('CSS da operação usa apenas tokens para cores', () => {
    const start = css.indexOf('/* ---- Central de Operação (Sprint 12.10) ---- */');
    assert.ok(start >= 0);
    const block = css.slice(start, css.indexOf('.auth-loading', start));
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(block, /rgba?\(/);
  });
});
