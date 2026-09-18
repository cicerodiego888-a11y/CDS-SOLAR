import { AUXSOL_AUTH_TOKEN_PATH, AUXSOL_SUCCESS_CODE } from './auxsol.config';
import {
  AuxsolAuthError,
  AuxsolInvalidPayloadError,
  AuxsolRequestError,
  AuxsolTransientError,
} from './auxsol.errors';
import { auxsolHttpRequest, requestAuxsolAccessToken } from './auxsol.http';

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => {
        const key = Object.keys(headers ?? {}).find((item) => item.toLowerCase() === name.toLowerCase());
        return key ? headers![key] : null;
      },
    },
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('AUXSOL HTTP / auth contract', () => {
  const baseUrl = 'https://auxsol.example.test';
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  it('POST /auth/token com contrato oficial retorna access_token', async () => {
    const fetchImpl = jest.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`${baseUrl}${AUXSOL_AUTH_TOKEN_PATH}`);
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json; charset=UTF-8',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        app_id: 'test-app-id',
        app_secret: 'test-app-secret',
        lang: 'zh-CN',
      });
      return jsonResponse(200, {
        code: AUXSOL_SUCCESS_CODE,
        msg: null,
        data: {
          access_token: 'test-access-token',
          expires_in: 43200,
        },
      });
    });

    const token = await requestAuxsolAccessToken({
      baseUrl,
      appId: 'test-app-id',
      appSecret: 'test-app-secret',
      fetchImpl: fetchImpl as never,
    });

    expect(token).toEqual({ accessToken: 'test-access-token', expiresIn: 43200 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejeita resposta 200 sem access_token', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, {
      code: AUXSOL_SUCCESS_CODE,
      msg: null,
      data: { expires_in: 100 },
    }));
    await expect(requestAuxsolAccessToken({
      baseUrl,
      appId: 'test-app-id',
      appSecret: 'test-app-secret',
      fetchImpl: fetchImpl as never,
    })).rejects.toBeInstanceOf(AuxsolInvalidPayloadError);
  });

  it('rejeita code diferente de AWX-0000', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, {
      code: 'AWX-9999',
      msg: 'denied',
      data: { access_token: 'x', expires_in: 10 },
    }));
    await expect(requestAuxsolAccessToken({
      baseUrl,
      appId: 'a',
      appSecret: 'b',
      fetchImpl: fetchImpl as never,
    })).rejects.toBeInstanceOf(AuxsolAuthError);
  });

  it('trata HTTP 401 como AuxsolAuthError sem sucesso', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(401, { code: 'AWX-401', msg: 'unauthorized' }));
    await expect(requestAuxsolAccessToken({
      baseUrl,
      appId: 'a',
      appSecret: 'bad',
      fetchImpl: fetchImpl as never,
    })).rejects.toBeInstanceOf(AuxsolAuthError);
  });

  it.each([429, 500, 502, 503, 504])('trata HTTP %s como transitório', async (status) => {
    const fetchImpl = jest.fn(async () => jsonResponse(status, { msg: `err-${status}` }, status === 429 ? { 'Retry-After': '0' } : undefined));
    await expect(auxsolHttpRequest({
      baseUrl,
      path: '/auth/token',
      method: 'POST',
      body: { app_id: 'a', app_secret: 'b', lang: 'zh-CN' },
      fetchImpl: fetchImpl as never,
    })).rejects.toMatchObject({ name: 'AuxsolTransientError', statusCode: status });
  });

  it.each([400, 403, 404])('trata HTTP %s como AuxsolRequestError', async (status) => {
    const fetchImpl = jest.fn(async () => jsonResponse(status, { msg: `err-${status}` }));
    await expect(auxsolHttpRequest({
      baseUrl,
      path: '/auth/token',
      method: 'POST',
      body: {},
      fetchImpl: fetchImpl as never,
    })).rejects.toBeInstanceOf(AuxsolRequestError);
  });

  it('trata timeout via AbortSignal', async () => {
    const fetchImpl = jest.fn(async (_url: string | URL, init?: RequestInit) => {
      await new Promise<void>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
      return jsonResponse(200, {});
    });
    await expect(auxsolHttpRequest({
      baseUrl,
      path: '/auth/token',
      method: 'POST',
      body: {},
      timeoutMs: 20,
      fetchImpl: fetchImpl as never,
    })).rejects.toBeInstanceOf(AuxsolTransientError);
  });

  it('trata network error como transitório', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(auxsolHttpRequest({
      baseUrl,
      path: '/auth/token',
      method: 'POST',
      body: {},
      fetchImpl: fetchImpl as never,
    })).rejects.toBeInstanceOf(AuxsolTransientError);
  });

  it('não registra APP_SECRET nem access_token nos logs', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchImpl = jest.fn(async () => jsonResponse(200, {
      code: AUXSOL_SUCCESS_CODE,
      msg: null,
      data: { access_token: 'test-access-token-secret-value', expires_in: 60 },
    }));

    await requestAuxsolAccessToken({
      baseUrl,
      appId: 'test-app-id',
      appSecret: 'test-app-secret-value',
      fetchImpl: fetchImpl as never,
    });

    const dumped = [...info.mock.calls, ...error.mock.calls].map((call) => JSON.stringify(call));
    expect(dumped.join('\n')).not.toContain('test-app-secret-value');
    expect(dumped.join('\n')).not.toContain('test-access-token-secret-value');
    expect(dumped.join('\n')).not.toMatch(/Bearer\s+\S+/i);
    expect(dumped.join('\n')).toContain('"authenticated":true');
    expect(dumped.join('\n')).toContain('"expiresIn":60');
    expect(dumped.join('\n')).toContain('envelopeKeys');
  });

  it('anexa query string oficial sem alterar o path', async () => {
    const fetchImpl = jest.fn(async (url: string | URL) => {
      expect(String(url)).toBe(`${baseUrl}/archive/plant/list?current=1&size=100`);
      return jsonResponse(200, { code: AUXSOL_SUCCESS_CODE, data: { records: [] } });
    });
    await auxsolHttpRequest({
      baseUrl,
      path: '/archive/plant/list',
      method: 'GET',
      query: { current: 1, size: 100 },
      accessToken: 'test-access-token',
      fetchImpl: fetchImpl as never,
    });
  });

  it('anexa Authorization Bearer em requests autenticadas', async () => {
    const fetchImpl = jest.fn(async (_url: string | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-access-token');
      return jsonResponse(200, { code: AUXSOL_SUCCESS_CODE, data: {} });
    });
    await auxsolHttpRequest({
      baseUrl,
      path: '/auth/token',
      method: 'GET',
      accessToken: 'test-access-token',
      fetchImpl: fetchImpl as never,
    });
  });
});
