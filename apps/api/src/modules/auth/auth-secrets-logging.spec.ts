import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertProductionJwtSecret,
  resolveJwtSigningSecret,
} from './jwt-secrets';

/**
 * Regressão: secrets e senhas não devem aparecer em logs, erros ou fontes de auth.
 */
describe('auth secrets logging hygiene', () => {
  const authDir = __dirname;
  const authSources = [
    'auth.service.ts',
    'auth.controller.ts',
    'auth.module.ts',
    'jwt-secrets.ts',
    'jwt-auth.guard.ts',
  ].map((name) => readFileSync(join(authDir, name), 'utf8'));

  it('fontes de auth não logam password, JWT_SECRET nem Authorization Bearer', () => {
    const joined = authSources.join('\n');
    expect(joined).not.toMatch(/console\.(log|info|debug|warn|error)\([^)]*password/i);
    expect(joined).not.toMatch(/console\.(log|info|debug|warn|error)\([^)]*JWT_SECRET/i);
    expect(joined).not.toMatch(/console\.(log|info|debug|warn|error)\([^)]*JWT_REFRESH_SECRET/i);
    expect(joined).not.toMatch(/console\.(log|info|debug|warn|error)\([^)]*APP_SECRET/i);
  });

  it('mensagens de erro de JWT não incluem o valor do secret', () => {
    const insecure = 'change-this-in-production';
    try {
      assertProductionJwtSecret(insecure, 'JWT_SECRET');
      fail('expected throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(insecure);
      expect(message).toContain('JWT_SECRET');
    }
  });

  it('resolveJwtSigningSecret em produção não embute o secret na mensagem', () => {
    try {
      resolveJwtSigningSecret({ NODE_ENV: 'production', JWT_SECRET: 'dev-secret' });
      fail('expected throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('dev-secret');
    }
  });
});
