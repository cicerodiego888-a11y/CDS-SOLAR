import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatEnergyKwh, formatPowerKw } from './format.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const view = readFileSync(join(root, 'components/dashboard/DashboardView.tsx'), 'utf8');
const chart = readFileSync(join(root, 'components/dashboard/GenerationChart.tsx'), 'utf8');
const globals = readFileSync(join(root, 'app/globals.css'), 'utf8');
const dashboardTypes = readFileSync(join(root, 'lib/dashboard.ts'), 'utf8');
const distribution = readFileSync(join(root, 'components/dashboard/PlantDistribution.tsx'), 'utf8');

describe('Dashboard visual / dados', () => {
  it('continua carregando overview com period e polling preservados', () => {
    assert.match(view, /\/monitoring\/overview\?period=\$\{period\}/);
    assert.match(view, /DASHBOARD_POLL_MS/);
    assert.match(view, /setInterval\(\(\) => void load\(\), DASHBOARD_POLL_MS\)/);
    assert.match(view, /LoadingState/);
    assert.match(view, /ErrorMessage/);
  });

  it('renderiza KPIs, gráfico, usinas e alertas sem inventar endpoints', () => {
    assert.match(view, /MetricCard/);
    assert.match(view, /GenerationChart/);
    assert.match(view, /PlantDistribution/);
    assert.match(view, /recentAlerts/);
    assert.match(view, /recentPlants/);
    assert.doesNotMatch(view, /fetchApi<[^>]+>\('\/(?!monitoring\/overview)/);
  });

  it('ausência de geração usa empty state e não vira zero no format', () => {
    assert.match(chart, /Sem dados de geração/);
    assert.match(chart, /Não há leituras disponíveis/);
    assert.equal(formatEnergyKwh(null, false), '—');
    assert.equal(formatPowerKw(null, false), '—');
    assert.equal(formatEnergyKwh(0, true), '0 kWh');
    assert.equal(formatPowerKw(0, true), '0 kW');
  });

  it('overview não expõe nem consome dados de usuário interno (operator)', () => {
    assert.doesNotMatch(dashboardTypes, /operator/i);
    for (const source of [view, chart, distribution]) {
      assert.doesNotMatch(source, /\.operator\b|operator\s*[:?]/);
    }
  });

  it('CSS do dashboard usa tokens semânticos', () => {
    assert.match(globals, /\.dashboard-panel[\s\S]*--color-surface/);
    assert.match(globals, /\.dashboard-section-label/);
    assert.match(globals, /\.period-btn\.active[\s\S]*--color-brand-primary/);
  });
});
