import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NORMALIZED_STATUS_LABELS,
  UNAVAILABLE_LABEL,
  UNIDENTIFIED_LABEL,
  equipmentStatusLabel,
  isKnownNormalizedStatus,
  normalizedStatusLabel,
  observedStatusLabel,
  operationalHealthLabel,
  diagnosisStatusLabel,
} from './status-labels.ts';

describe('status-labels — apresentação pt-BR', () => {
  it('UNKNOWN é exibido como Não identificado', () => {
    assert.equal(normalizedStatusLabel('UNKNOWN'), 'Não identificado');
    assert.equal(NORMALIZED_STATUS_LABELS.UNKNOWN, 'Não identificado');
  });

  it('ONLINE é exibido como Online', () => {
    assert.equal(normalizedStatusLabel('ONLINE'), 'Online');
  });

  it('OFFLINE é exibido como Offline', () => {
    assert.equal(normalizedStatusLabel('OFFLINE'), 'Offline');
  });

  it('WARNING é exibido como Em atenção', () => {
    assert.equal(normalizedStatusLabel('WARNING'), 'Em atenção');
  });

  it('ERROR é exibido como Com erro', () => {
    assert.equal(normalizedStatusLabel('ERROR'), 'Com erro');
  });

  it('ATTENTION é exibido como Atenção', () => {
    assert.equal(operationalHealthLabel('ATTENTION'), 'Atenção');
    assert.equal(diagnosisStatusLabel('ATTENTION'), 'Atenção');
  });

  it('N/D e ausência viram Não disponível', () => {
    assert.equal(normalizedStatusLabel('N/D'), UNAVAILABLE_LABEL);
    assert.equal(normalizedStatusLabel(null), UNAVAILABLE_LABEL);
    assert.equal(normalizedStatusLabel(''), UNAVAILABLE_LABEL);
    assert.equal(UNAVAILABLE_LABEL, 'Não disponível');
  });

  it('valores desconhecidos recebem fallback em português', () => {
    assert.equal(normalizedStatusLabel('FOO_BAR'), UNIDENTIFIED_LABEL);
    assert.equal(normalizedStatusLabel('xyz'), UNIDENTIFIED_LABEL);
    assert.equal(equipmentStatusLabel(null, '1'), UNIDENTIFIED_LABEL);
  });

  it('valores técnicos originais permanecem inalterados', () => {
    const original = { status: 'UNKNOWN', observed: 'ONLINE', health: 'ATTENTION' };
    void normalizedStatusLabel(original.status);
    void observedStatusLabel(original.observed);
    void operationalHealthLabel(original.health);
    assert.equal(original.status, 'UNKNOWN');
    assert.equal(original.observed, 'ONLINE');
    assert.equal(original.health, 'ATTENTION');
  });

  it('nenhum estado desconhecido é convertido em estado operacional conhecido', () => {
    const unknown = 'SOMETHING_ELSE';
    assert.equal(isKnownNormalizedStatus(unknown), false);
    const label = normalizedStatusLabel(unknown);
    assert.notEqual(label, NORMALIZED_STATUS_LABELS.ONLINE);
    assert.notEqual(label, NORMALIZED_STATUS_LABELS.OFFLINE);
    assert.notEqual(label, NORMALIZED_STATUS_LABELS.WARNING);
    assert.notEqual(label, NORMALIZED_STATUS_LABELS.ERROR);
    assert.equal(label, UNIDENTIFIED_LABEL);
    // código bruto do fabricante não vira ONLINE
    assert.equal(equipmentStatusLabel(undefined, '1'), UNIDENTIFIED_LABEL);
    assert.equal(equipmentStatusLabel('ONLINE', '1'), 'Online');
  });

  it('status observado usa o mesmo mapa normalizado', () => {
    assert.equal(observedStatusLabel('WARNING'), 'Em atenção');
    assert.equal(observedStatusLabel(null), 'Não disponível');
  });
});
