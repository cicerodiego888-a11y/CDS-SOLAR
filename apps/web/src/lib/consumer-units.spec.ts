import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPlantUnitSelection,
  buildConsumerUnitPayload,
  consumerUnitLabel,
  otherConsumerUnitMessage,
  plantConsumerUnitDisplay,
  plantDistributorDisplay,
  validateConsumerUnitForm,
} from './consumer-units.ts';

describe('unidades consumidoras na UI', () => {
  it('cadastro e edição separam UC da Conta Contrato', () => {
    const errors = validateConsumerUnitForm({
      distributorId: '',
      number: '',
      contractAccount: 'abc',
    });
    assert.equal(errors.distributorId, 'Selecione a distribuidora.');
    assert.equal(errors.number, 'Informe o número da unidade consumidora.');
    assert.equal(errors.contractAccount, 'Conta Contrato inválida.');

    const payload = buildConsumerUnitPayload({
      distributorId: 'd1',
      number: '11.230.436',
      contractAccount: '003.005.596.601',
    });
    assert.deepEqual(payload, {
      distributorId: 'd1',
      number: '11230436',
      contractAccount: '003005596601',
    });
    assert.notEqual(payload.number, payload.contractAccount);

    const withoutContract = buildConsumerUnitPayload({
      distributorId: 'd1',
      number: '11230436',
      contractAccount: '',
    });
    assert.equal(withoutContract.contractAccount, undefined);
  });

  it('seleção na usina deriva a distribuidora e filtra pelo consumidor', () => {
    const unit = {
      id: 'u1',
      number: '11230436',
      contractAccount: '003005596601',
      status: 'ACTIVE',
      distributor: { id: 'd1', name: 'Equatorial', code: 'EQ' },
    };
    assert.equal(consumerUnitLabel(unit), '11230436 — Equatorial');
    const selected = applyPlantUnitSelection(
      { customerId: 'c1', consumerUnitId: '', distributor: '', consumerUnit: '' },
      unit,
    );
    assert.equal(selected.consumerUnitId, 'u1');
    assert.equal(selected.distributor, 'Equatorial');
    assert.equal(selected.consumerUnit, '11230436');
    assert.equal(
      plantDistributorDisplay({ consumerUnitRef: { distributor: { name: 'Equatorial' } }, distributor: 'legado' }),
      'Equatorial',
    );
    assert.equal(
      plantConsumerUnitDisplay({ consumerUnitRef: { number: '11230436' }, consumerUnit: 'legado' }),
      '11230436',
    );
    assert.equal(plantConsumerUnitDisplay({ consumerUnit: 'legado' }), 'legado');
    assert.equal(otherConsumerUnitMessage().includes('outro consumidor'), true);
  });

  it('ausência de UC fica explícita', () => {
    assert.equal(plantConsumerUnitDisplay({}), '—');
    assert.equal(plantDistributorDisplay({}), '—');
  });
});
