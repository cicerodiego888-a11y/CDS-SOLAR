import {
  assertProductionJwtConfiguration,
  assertProductionJwtSecret,
  isInsecureJwtSecret,
  MIN_PRODUCTION_JWT_SECRET_LENGTH,
  resolveJwtSigningSecret,
} from './jwt-secrets';

describe('jwt-secrets', () => {
  const strong = 'a'.repeat(MIN_PRODUCTION_JWT_SECRET_LENGTH);

  it('rejeita defaults conhecidos', () => {
    expect(isInsecureJwtSecret('dev-secret')).toBe(true);
    expect(isInsecureJwtSecret('change-this-in-production')).toBe(true);
    expect(isInsecureJwtSecret('change-this-refresh-in-production')).toBe(true);
    expect(isInsecureJwtSecret('')).toBe(true);
    expect(isInsecureJwtSecret(undefined)).toBe(true);
    expect(isInsecureJwtSecret(strong)).toBe(false);
  });

  it('produção sem JWT_SECRET falha', () => {
    expect(() => assertProductionJwtConfiguration({
      NODE_ENV: 'production',
      JWT_REFRESH_SECRET: strong,
    })).toThrow(/JWT_SECRET não configurado/);
  });

  it('produção sem JWT_REFRESH_SECRET falha', () => {
    expect(() => assertProductionJwtConfiguration({
      NODE_ENV: 'production',
      JWT_SECRET: strong,
    })).toThrow(/JWT_REFRESH_SECRET não configurado/);
  });

  it('produção com default conhecido falha', () => {
    expect(() => assertProductionJwtSecret('dev-secret', 'JWT_SECRET'))
      .toThrow(/default\/inseguro/);
    expect(() => assertProductionJwtSecret('change-this-in-production', 'JWT_SECRET'))
      .toThrow(/default\/inseguro/);
    expect(() => assertProductionJwtSecret('change-this-refresh-in-production', 'JWT_REFRESH_SECRET'))
      .toThrow(/default\/inseguro/);
  });

  it('produção com secret curto falha', () => {
    expect(() => assertProductionJwtSecret('short-but-not-default', 'JWT_SECRET'))
      .toThrow(/pelo menos/);
  });

  it('produção com secrets válidos passa', () => {
    expect(() => assertProductionJwtConfiguration({
      NODE_ENV: 'production',
      JWT_SECRET: strong,
      JWT_REFRESH_SECRET: `b${strong.slice(1)}`,
    })).not.toThrow();
  });

  it('mensagens de erro não incluem o valor do secret', () => {
    try {
      assertProductionJwtSecret('dev-secret', 'JWT_SECRET');
      fail('expected throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      expect(message).not.toContain('dev-secret');
    }
  });

  it('desenvolvimento permite fallback local sem JWT_SECRET', () => {
    expect(resolveJwtSigningSecret({ NODE_ENV: 'development' })).toBe('dev-secret');
    expect(resolveJwtSigningSecret({ NODE_ENV: 'development', JWT_SECRET: 'local-dev' })).toBe('local-dev');
  });

  it('produção resolve signing secret apenas se válido', () => {
    expect(resolveJwtSigningSecret({
      NODE_ENV: 'production',
      JWT_SECRET: strong,
      JWT_REFRESH_SECRET: strong,
    })).toBe(strong);
    expect(() => resolveJwtSigningSecret({
      NODE_ENV: 'production',
      JWT_SECRET: 'dev-secret',
    })).toThrow();
  });
});
