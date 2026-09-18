import { stripSensitiveObject } from './security.redact';

describe('stripSensitiveObject', () => {
  it('remove chaves sensíveis no primeiro nível', () => {
    expect(stripSensitiveObject({
      apiKey: 'secret',
      Authorization: 'Bearer x',
      powerKw: 1,
    })).toEqual({ powerKw: 1 });
  });

  it('remove token/secret aninhados sem alterar telemetria', () => {
    expect(stripSensitiveObject({
      code: 'AWX-0000',
      data: {
        sn: 'ASN-1',
        access_token: 'must-not-leak',
        energyData: { power: 1.2, app_secret: 'nope' },
      },
    })).toEqual({
      code: 'AWX-0000',
      data: {
        sn: 'ASN-1',
        energyData: { power: 1.2 },
      },
    });
  });

  it('percorre arrays', () => {
    expect(stripSensitiveObject({
      data: [{ sn: 'A', token: 'x' }, { sn: 'B' }],
    })).toEqual({
      data: [{ sn: 'A' }, { sn: 'B' }],
    });
  });
});
