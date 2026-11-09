import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  integrationBindingLabel,
  resolveOperationalIntegrationState,
} from './integration-status.ts';

describe('Estados de integração no frontend', () => {
  it('não mostra offline para BLOCKED', () => {
    const label = integrationBindingLabel({
      manufacturerCode: 'AUXSOL',
      status: 'NOT_CONFIGURED',
      hasBinding: true,
      lastErrorMessage: 'Integração bloqueada até o contrato oficial.',
    });
    assert.equal(label, 'Integração aguardando configuração/contrato oficial');
    assert.equal(label.includes('Offline'), false);
  });

  it('distingue não configurado, pronto e erro', () => {
    assert.equal(integrationBindingLabel({}), 'Integração não configurada');
    assert.equal(integrationBindingLabel({ status: 'READY' }), 'Configuração pronta');
    assert.equal(integrationBindingLabel({ status: 'COMMUNICATION_ERROR' }), 'Falha na comunicação');
  });

  it('rótulos de integração não usam offline', () => {
    assert.equal(integrationBindingLabel({ manufacturerCode: 'DEYE', hasBinding: true }).includes('Offline'), false);
  });
});

describe('Estados operacionais de apresentação (Sprint 6)', () => {
  const now = new Date('2026-09-26T15:00:00.000Z');

  it('não configurado sem binding', () => {
    const result = resolveOperationalIntegrationState({});
    assert.equal(result.state, 'NOT_CONFIGURED');
  });

  it('aguardando identificação sem externalId', () => {
    const result = resolveOperationalIntegrationState({
      hasBinding: true,
      bindingStatus: 'READY',
    });
    assert.equal(result.state, 'AWAITING_IDENTIFICATION');
  });

  it('configurado aguardando dados', () => {
    const result = resolveOperationalIntegrationState({
      hasBinding: true,
      bindingStatus: 'CONNECTED',
      externalId: 'ext-1',
    });
    assert.equal(result.state, 'CONFIGURED_AWAITING_DATA');
  });

  it('online com leitura recente', () => {
    const result = resolveOperationalIntegrationState({
      hasBinding: true,
      bindingStatus: 'CONNECTED',
      externalId: 'ext-1',
      lastReadingAt: '2026-09-26T14:50:00.000Z',
      communicationOk: true,
      now,
    });
    assert.equal(result.state, 'ONLINE');
  });

  it('sem comunicação quando leitura antiga', () => {
    const result = resolveOperationalIntegrationState({
      hasBinding: true,
      bindingStatus: 'CONNECTED',
      externalId: 'ext-1',
      lastReadingAt: '2026-09-26T12:00:00.000Z',
      communicationOk: true,
      now,
    });
    assert.equal(result.state, 'NO_COMMUNICATION');
  });

  it('erro em COMMUNICATION_ERROR', () => {
    const result = resolveOperationalIntegrationState({
      hasBinding: true,
      bindingStatus: 'COMMUNICATION_ERROR',
      externalId: 'ext-1',
    });
    assert.equal(result.state, 'ERROR');
  });

  it('não trata ausência de dado como online', () => {
    const result = resolveOperationalIntegrationState({
      hasBinding: true,
      bindingStatus: 'READY',
      externalId: 'ext-1',
      lastReadingAt: null,
    });
    assert.notEqual(result.state, 'ONLINE');
  });
});
