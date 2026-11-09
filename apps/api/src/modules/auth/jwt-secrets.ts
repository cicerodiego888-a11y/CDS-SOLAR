/**
 * Validação de secrets JWT.
 * Em produção: obrigatórios, sem defaults conhecidos, tamanho mínimo.
 * Em desenvolvimento: JWT_SECRET pode cair para "dev-secret" localmente.
 * Nunca logar ou retornar o valor do secret.
 */

const INSECURE_SECRETS = new Set([
  'dev-secret',
  'change-this-in-production',
  'change-this-refresh-in-production',
  'secret',
  'jwt-secret',
  'jwt_secret',
  'your-secret-here',
  'your-jwt-secret',
  'password',
  '123456',
  'changeme',
]);

export const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32;

export function isProductionEnv(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === 'production';
}

export function isInsecureJwtSecret(value: string | undefined | null) {
  const secret = value?.trim() ?? '';
  if (!secret) return true;
  if (INSECURE_SECRETS.has(secret.toLowerCase())) return true;
  return false;
}

export function assertProductionJwtSecret(
  value: string | undefined | null,
  name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET',
) {
  const secret = value?.trim() ?? '';
  if (!secret) {
    throw new Error(`${name} não configurado para produção.`);
  }
  if (isInsecureJwtSecret(secret)) {
    throw new Error(`${name} não pode usar valor default/inseguro em produção.`);
  }
  if (secret.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
    throw new Error(`${name} deve ter pelo menos ${MIN_PRODUCTION_JWT_SECRET_LENGTH} caracteres em produção.`);
  }
}

/** Falha cedo se NODE_ENV=production com secrets ausentes/inseguros. */
export function assertProductionJwtConfiguration(env: NodeJS.ProcessEnv = process.env) {
  if (!isProductionEnv(env)) return;
  assertProductionJwtSecret(env.JWT_SECRET, 'JWT_SECRET');
  assertProductionJwtSecret(env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET');
}

/** Secret usado pelo JwtModule. Em produção já validado; em dev permite fallback local. */
export function resolveJwtSigningSecret(env: NodeJS.ProcessEnv = process.env) {
  if (isProductionEnv(env)) {
    assertProductionJwtSecret(env.JWT_SECRET, 'JWT_SECRET');
    return env.JWT_SECRET!.trim();
  }
  const secret = env.JWT_SECRET?.trim();
  return secret || 'dev-secret';
}
