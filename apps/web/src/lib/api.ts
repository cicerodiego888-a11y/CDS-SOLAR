import { getAccessToken, notifyUnauthorized } from './auth-session';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

async function requestWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  init.signal?.addEventListener('abort', abortFromCaller, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(408, 'A solicitação demorou demais. Tente novamente.');
    }
    if (error instanceof TypeError) {
      throw new ApiError(503, 'A API não está respondendo em localhost:3001. Verifique se o ambiente B7 está no ar.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await requestWithTimeout(`${API_BASE}${path}`, { ...init, headers });

  if (response.status === 401) {
    notifyUnauthorized();
    throw new ApiError(401, 'Sua sessão expirou. Entre novamente.');
  }
  if (response.status === 403) {
    throw new ApiError(403, 'Você não possui permissão para acessar este recurso.');
  }
  if (!response.ok) {
    throw new ApiError(response.status, await readApiMessage(response, 'Falha ao consultar a API'));
  }
  return response.json() as Promise<T>;
}

async function readApiMessage(response: Response, fallback: string) {
  const body = await response.clone().json().catch(() => null) as { message?: string | string[] } | null;
  if (Array.isArray(body?.message)) return body.message.join(' ');
  if (typeof body?.message === 'string') return body.message;
  return fallback;
}

export async function loginRequest(email: string, password: string) {
  const response = await requestWithTimeout(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password: password.trim() }),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 400) {
      throw new ApiError(response.status, 'Usuário ou senha inválidos.');
    }
    throw new ApiError(response.status, await readApiMessage(response, 'Não foi possível entrar agora. Tente novamente.'));
  }
  return response.json() as Promise<{ accessToken: string; user: import('./auth-session').AuthUser }>;
}
