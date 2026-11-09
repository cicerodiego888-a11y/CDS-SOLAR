import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  plantConsumerUnitDisplay,
  plantEnergyFieldMode,
} from './consumer-units.ts';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '../app');
const list = readFileSync(join(appDir, 'usinas/page.tsx'), 'utf8');
const detail = readFileSync(join(appDir, 'usinas/[id]/page.tsx'), 'utf8');

describe('telas de usinas', () => {
  it('lista preserva APIs, busca, filtros e formulário formal/legado', () => {
    assert.match(list, /fetchApi<Plant\[\]>\('\/plants'\)/);
    assert.match(list, /busca-usina/);
    assert.match(list, /filtro-estado/);
    assert.match(list, /Nova usina/);
    assert.match(list, /consumerUnitId/);
    assert.match(list, /applyPlantUnitSelection/);
    assert.match(list, /Concessionária/);
    assert.match(list, /Plant\.consumerUnit/);
    assert.match(list, /Unidade consumidora/);
    assert.match(list, /LoadingState/);
    assert.match(list, /ErrorMessage/);
    assert.match(list, /EmptyState/);
  });

  it('detalhe separa UC formal de referência legada', () => {
    assert.match(detail, /\/plants\/\$\{params\.id\}/);
    assert.match(detail, /Unidade consumidora \(formal\)|consumerUnitRef/);
    assert.match(detail, /Referência legada/);
    assert.match(detail, /Plant\.consumerUnit/);
    assert.match(detail, /Inversores/);
    assert.match(detail, /Equipamentos/);
    assert.match(detail, /Dados da usina/);
    assert.match(detail, /Monitoramento do inversor/);
    assert.match(detail, /\/integrations\/collect\/\$\{item\.id\}/);
    assert.match(detail, /liveByInverter/);
    assert.doesNotMatch(detail, /consumerUnitId:\s*data\.consumerUnit/);
  });

  it('helpers não confundem formal com legado', () => {
    assert.equal(plantEnergyFieldMode(true, 2), 'formal');
    assert.equal(plantEnergyFieldMode(true, 0), 'legacy');
    assert.equal(plantConsumerUnitDisplay({ consumerUnitRef: { number: '100' }, consumerUnit: 'legado' }), '100');
    assert.equal(plantConsumerUnitDisplay({ consumerUnit: 'legado' }), 'legado');
  });
});
