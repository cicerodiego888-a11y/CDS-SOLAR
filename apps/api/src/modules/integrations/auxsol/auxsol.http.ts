import {
  AUXSOL_AUTH_TOKEN_PATH,
  AUXSOL_MAX_RETRY_AFTER_WAIT_MS,
  AUXSOL_SUCCESS_CODE,
  auxsolTimeoutMs,
  integrationLog,
} from './auxsol.config';
import {
  AuxsolAuthError,
  AuxsolInvalidPayloadError,
  AuxsolRequestError,
  AuxsolTransientError,
} from './auxsol.errors';

export type AuxsolFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type AuxsolHttpRequest = {
  baseUrl: string;
  path: string;
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  accessToken?: string;
  timeoutMs?: number;
  fetchImpl?: AuxsolFetch;
  /** Quando true, aplica espera limitada em Retry-After antes de lançar 429. */
  honorRetryAfter?: boolean;
};

export type AuxsolHttpResponse = {
  status: number;
  code?: string;
  msg?: string | null;
  data: unknown;
  /** JSON parseado completo da AUXSOL (sem reconstrução). Não logar este objeto. */
  body?: unknown;
  envelopeKeys?: string[];
};

export async function withTimeout<T>(factory: (signal: AbortSignal) => Promise<T>, timeoutMs = auxsolTimeoutMs()) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await factory(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new AuxsolTransientError('timeout');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function appendQuery(
  path: string,
  query?: Record<string, string | number | boolean | undefined | null>,
) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  if (!qs) return path;
  return path.includes('?') ? `${path}&${qs}` : `${path}?${qs}`;
}

function joinUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(asSeconds * 1000, AUXSOL_MAX_RETRY_AFTER_WAIT_MS);
  }
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    if (delta > 0) return Math.min(delta, AUXSOL_MAX_RETRY_AFTER_WAIT_MS);
  }
  return undefined;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function mapHttpStatusError(status: number, code?: string, msg?: string | null): never {
  const detail = msg ? String(msg) : undefined;
  if (status === 401) {
    throw new AuxsolAuthError(detail || 'Falha de autenticação na integração AUXSOL (HTTP 401).');
  }
  if (status === 429) {
    throw new AuxsolTransientError(detail || 'HTTP 429', 429);
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    throw new AuxsolTransientError(detail || `HTTP ${status}`, status);
  }
  if (status === 400 || status === 403 || status === 404) {
    throw new AuxsolRequestError(detail || `HTTP ${status}`, status, code);
  }
  if (status >= 500) {
    throw new AuxsolTransientError(detail || `HTTP ${status}`, status);
  }
  throw new AuxsolRequestError(detail || `HTTP ${status}`, status, code);
}

/**
 * HTTP AUXSOL de baixo nível. Sem retry próprio — o AuxsolClient controla retries.
 * Timeout efetivo via AbortSignal (withTimeout).
 */
export async function auxsolHttpRequest(request: AuxsolHttpRequest): Promise<AuxsolHttpResponse> {
  const fetchImpl = request.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new AuxsolTransientError('HTTP fetch indisponível no runtime.');
  }

  const url = joinUrl(request.baseUrl, appendQuery(request.path, request.query));
  const method = request.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (request.body !== undefined) {
    headers['Content-Type'] = 'application/json; charset=UTF-8';
  }
  if (request.accessToken) {
    headers.Authorization = `Bearer ${request.accessToken}`;
  }

  const started = Date.now();
  let response: Response;
  try {
    response = await withTimeout(
      (signal) =>
        fetchImpl(url, {
          method,
          headers,
          body: request.body === undefined ? undefined : JSON.stringify(request.body),
          signal,
        }),
      request.timeoutMs ?? auxsolTimeoutMs(),
    );
  } catch (error) {
    if (error instanceof AuxsolTransientError) throw error;
    const message = error instanceof Error ? error.message : 'network error';
    console.error(integrationLog({
      operation: 'http',
      endpoint: request.path,
      status: 'error',
      errorCode: 'network',
      durationMs: Date.now() - started,
    }));
    throw new AuxsolTransientError(message.includes('timeout') ? 'timeout' : `network error: ${message}`);
  }

  if (response.status === 429 && request.honorRetryAfter !== false) {
    const waitMs = parseRetryAfterMs(response.headers.get('retry-after'));
    if (waitMs && waitMs > 0) {
      await sleep(waitMs);
    }
  }

  let payload: unknown;
  const text = await response.text();
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  const code = typeof record?.code === 'string' ? record.code : undefined;
  const msg = record && 'msg' in record ? (record.msg as string | null) : undefined;
  const data = record && 'data' in record ? record.data : payload;

  const envelopeKeys = record ? Object.keys(record) : [];
  const dataKind = Array.isArray(data) ? 'array' : data === null ? 'null' : typeof data;

  console.info(integrationLog({
    operation: 'http',
    endpoint: request.path,
    httpStatus: response.status,
    auxsolCode: code,
    envelopeKeys: envelopeKeys.join(',') || undefined,
    dataKind,
    durationMs: Date.now() - started,
  }));

  if (!response.ok) {
    mapHttpStatusError(response.status, code, msg);
  }

  return { status: response.status, code, msg, data, body: record ?? payload, envelopeKeys };
}

export type AuxsolTokenResponse = {
  accessToken: string;
  expiresIn: number;
};

export async function requestAuxsolAccessToken(params: {
  baseUrl: string;
  appId: string;
  appSecret: string;
  timeoutMs?: number;
  fetchImpl?: AuxsolFetch;
  lang?: string;
}): Promise<AuxsolTokenResponse> {
  const started = Date.now();
  console.info(integrationLog({
    operation: 'auth',
    endpoint: AUXSOL_AUTH_TOKEN_PATH,
    status: 'start',
  }));

  const response = await auxsolHttpRequest({
    baseUrl: params.baseUrl,
    path: AUXSOL_AUTH_TOKEN_PATH,
    method: 'POST',
    body: {
      app_id: params.appId,
      app_secret: params.appSecret,
      lang: params.lang ?? 'zh-CN',
    },
    timeoutMs: params.timeoutMs,
    fetchImpl: params.fetchImpl,
  });

  if (response.code && response.code !== AUXSOL_SUCCESS_CODE) {
    console.error(integrationLog({
      operation: 'auth',
      endpoint: AUXSOL_AUTH_TOKEN_PATH,
      status: 'error',
      auxsolCode: response.code,
      durationMs: Date.now() - started,
    }));
    throw new AuxsolAuthError(
      typeof response.msg === 'string' && response.msg
        ? response.msg
        : `Autenticação AUXSOL rejeitada (code=${response.code}).`,
    );
  }

  const data = response.data && typeof response.data === 'object'
    ? (response.data as Record<string, unknown>)
    : null;
  const accessToken = typeof data?.access_token === 'string' ? data.access_token.trim() : '';
  const expiresIn = Number(data?.expires_in);

  if (!accessToken) {
    throw new AuxsolInvalidPayloadError('Resposta /auth/token sem access_token válido.');
  }
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new AuxsolInvalidPayloadError('Resposta /auth/token sem expires_in válido.');
  }

  console.info(integrationLog({
    operation: 'auth',
    endpoint: AUXSOL_AUTH_TOKEN_PATH,
    status: 'success',
    httpStatus: response.status,
    auxsolCode: response.code,
    authenticated: true,
    expiresIn,
    durationMs: Date.now() - started,
  }));

  return { accessToken, expiresIn };
}
