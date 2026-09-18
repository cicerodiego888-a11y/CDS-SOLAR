import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePowerKw } from './operational.ts';

describe('parsePowerKw', () => {
  it('aceita ponto e vírgula', () => {
    assert.equal(parsePowerKw('10'), 10);
    assert.equal(parsePowerKw('10,5'), 10.5);
    assert.equal(parsePowerKw('10.5'), 10.5);
    assert.equal(parsePowerKw(' 8,25 '), 8.25);
  });

  it('rejeita vazio e inválido', () => {
    assert.equal(parsePowerKw(''), undefined);
    assert.equal(parsePowerKw('abc'), undefined);
    assert.equal(parsePowerKw('10 kW'), undefined);
  });
});
