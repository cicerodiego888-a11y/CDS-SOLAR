import {
  assertBindingPayloadHasNoSecrets,
  isInverterLinkableEquipmentType,
  resolveIntegrationExternalId,
  sanitizeBindingForLog,
} from './integration-binding.identity';

describe('integration-binding.identity', () => {
  it('prefere IntegrationBinding.externalId ao legado do inversor', () => {
    expect(resolveIntegrationExternalId({
      bindingExternalId: 'ext-binding',
      inverterExternalId: 'ext-legacy',
    })).toEqual({ source: 'binding', externalId: 'ext-binding' });
  });

  it('usa legado do inversor apenas quando o binding não tem identidade', () => {
    expect(resolveIntegrationExternalId({
      bindingExternalId: null,
      inverterExternalId: 'ext-legacy',
    })).toEqual({ source: 'inverter_legacy', externalId: 'ext-legacy' });
  });

  it('não inventa identidade externa', () => {
    expect(resolveIntegrationExternalId({
      bindingExternalId: '  ',
      inverterExternalId: null,
    })).toEqual({ source: 'none', externalId: null });
  });

  it('permite gateway/datalogger vinculados e bloqueia secrets em payload', () => {
    expect(isInverterLinkableEquipmentType('GATEWAY')).toBe(true);
    expect(isInverterLinkableEquipmentType('DATALOGGER')).toBe(true);
    expect(isInverterLinkableEquipmentType('MEDIDOR')).toBe(false);
    expect(assertBindingPayloadHasNoSecrets({ provider: 'AUXSOL', externalId: 'x', status: 'READY' })).toBe(true);
    expect(assertBindingPayloadHasNoSecrets({ provider: 'AUXSOL', token: 'secret' })).toBe(false);
    expect(sanitizeBindingForLog({
      id: 'b1',
      provider: 'AUXSOL',
      externalId: 'ext',
      secretRef: 'vault://x',
      status: 'READY',
    })).toEqual({
      id: 'b1',
      provider: 'AUXSOL',
      externalId: 'ext',
      status: 'READY',
    });
  });
});
