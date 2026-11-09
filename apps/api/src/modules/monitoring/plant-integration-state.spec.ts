import {
  countOperationalIntegrationStates,
  resolveOperationalIntegrationState,
  resolvePlantOperationalIntegrationState,
} from './plant-integration-state';

describe('plant-integration-state', () => {
  const now = new Date('2026-09-26T15:00:00.000Z');

  it('resolve estados determinísticos', () => {
    expect(resolveOperationalIntegrationState({})).toBe('NOT_CONFIGURED');
    expect(resolveOperationalIntegrationState({ hasBinding: true, bindingStatus: 'READY' })).toBe('AWAITING_IDENTIFICATION');
    expect(resolveOperationalIntegrationState({
      hasBinding: true,
      bindingStatus: 'READY',
      externalId: 'ext',
    })).toBe('CONFIGURED_AWAITING_DATA');
    expect(resolveOperationalIntegrationState({
      hasBinding: true,
      bindingStatus: 'CONNECTED',
      externalId: 'ext',
      lastReadingAt: '2026-09-26T14:50:00.000Z',
      communicationOk: true,
      now,
    })).toBe('ONLINE');
    expect(resolveOperationalIntegrationState({
      hasBinding: true,
      bindingStatus: 'CONNECTED',
      externalId: 'ext',
      lastReadingAt: '2026-09-26T12:00:00.000Z',
      communicationOk: true,
      now,
    })).toBe('NO_COMMUNICATION');
    expect(resolveOperationalIntegrationState({
      hasBinding: true,
      bindingStatus: 'COMMUNICATION_ERROR',
      externalId: 'ext',
    })).toBe('ERROR');
  });

  it('agrega usina priorizando erro e comunicação', () => {
    expect(resolvePlantOperationalIntegrationState(['ONLINE', 'ERROR'])).toBe('ERROR');
    expect(resolvePlantOperationalIntegrationState(['ONLINE', 'NO_COMMUNICATION'])).toBe('NO_COMMUNICATION');
    expect(countOperationalIntegrationStates(['ONLINE', 'NOT_CONFIGURED']).online).toBe(1);
  });
});
