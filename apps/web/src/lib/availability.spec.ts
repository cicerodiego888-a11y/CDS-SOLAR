import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { healthLabel } from './availability.ts';
import { formatCoveragePercent, formatPercentOrNd } from './format.ts';

describe('Indicadores de disponibilidade', () => {
  it('não mostra 0% quando não há dados', () => {
    assert.equal(formatPercentOrNd(null), 'Não disponível');
    assert.equal(formatCoveragePercent(null), 'Não disponível');
    assert.equal(formatCoveragePercent(0), '0%');
  });

  it('não chama Offline para BLOCKED ou NO_DATA', () => {
    assert.equal(healthLabel('NO_DATA', 'INTEGRATION_BLOCKED'), 'Integração bloqueada');
    assert.equal(healthLabel('NO_DATA', 'INTEGRATION_NOT_CONFIGURED'), 'Não configurado');
    assert.equal(healthLabel('NO_DATA', 'NO_DATA'), 'Sem dados');
    assert.equal(healthLabel('NO_DATA', 'NO_DATA').includes('Offline'), false);
  });
});
