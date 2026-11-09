import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countPlantIntegrationStates,
  resolvePlantOperationalIntegrationState,
} from './plant-integration-state.ts';

describe('plant-integration-state web', () => {
  it('prioriza erro na agregação da usina', () => {
    const result = resolvePlantOperationalIntegrationState([
      { state: 'ONLINE' },
      { state: 'ERROR' },
    ]);
    assert.equal(result.state, 'ERROR');
  });

  it('conta estados sem inventar zeros de leitura', () => {
    const counts = countPlantIntegrationStates(['NOT_CONFIGURED', 'ONLINE']);
    assert.equal(counts.total, 2);
    assert.equal(counts.online, 1);
    assert.equal(counts.notConfigured, 1);
  });
});
