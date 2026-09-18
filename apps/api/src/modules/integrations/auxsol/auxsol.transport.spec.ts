import { AUXSOL_SUCCESS_CODE } from './auxsol.config';
import { AuxsolAuthError, AuxsolContractUnavailableError, AuxsolInvalidPayloadError } from './auxsol.errors';
import { AUXSOL_OFFICIAL_REALTIME_FIXTURE } from './auxsol.fixtures';
import {
  BlockedAuxsolTransport,
  createAuxsolTransport,
  HttpAuxsolTransport,
  MockAuxsolTransport,
} from './auxsol.transport';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('AuxsolTransport modes + live realtime', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('BLOCKED não chama HTTP', async () => {
    const fetchImpl = jest.fn();
    const transport = new BlockedAuxsolTransport();
    await expect(transport.execute('testConnection')).rejects.toBeInstanceOf(AuxsolContractUnavailableError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('MOCK não chama HTTP', async () => {
    const fetchImpl = jest.fn();
    const transport = new MockAuxsolTransport('valid');
    await expect(transport.execute('testConnection')).resolves.toEqual({ ok: true, fixture: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('createAuxsolTransport permanece blocked sem Base URL', () => {
    delete process.env.AUXSOL_API_BASE_URL;
    process.env.AUXSOL_MOCK_MODE = 'false';
    expect(createAuxsolTransport()).toBeInstanceOf(BlockedAuxsolTransport);
  });

  it('LIVE autentica via testConnection quando credenciais existem', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, {
      code: 'AWX-0000',
      msg: null,
      data: { access_token: 'test-access-token', expires_in: 43200 },
    }));
    const transport = new HttpAuxsolTransport({
      baseUrl: 'https://auxsol.example.test',
      appId: 'test-app-id',
      appSecret: 'test-app-secret',
      fetchImpl: fetchImpl as never,
    });
    await expect(transport.execute('testConnection')).resolves.toEqual({ ok: true, authenticated: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('LIVE collect chama GET realtime por SN com Bearer reutilizado', async () => {
    const fetchImpl = jest.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith('/auth/token')) {
        return jsonResponse(200, {
          code: AUXSOL_SUCCESS_CODE,
          msg: null,
          data: { access_token: 'test-access-token', expires_in: 43200 },
        });
      }
      expect(href).toBe(
        'https://auxsol.example.test/analysis/inverterReport/findInverterRealTimeInfoBySn/TEST-SN-001',
      );
      expect(init?.method).toBe('GET');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-access-token');
      return jsonResponse(200, AUXSOL_OFFICIAL_REALTIME_FIXTURE);
    });

    const transport = new HttpAuxsolTransport({
      baseUrl: 'https://auxsol.example.test',
      appId: 'test-app-id',
      appSecret: 'test-app-secret',
      fetchImpl: fetchImpl as never,
    });

    const payload = await transport.execute('collect', { serialNumber: 'TEST-SN-001' });
    expect(payload).toMatchObject({
      code: AUXSOL_SUCCESS_CODE,
      data: { sn: 'TEST-SN-001' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // Segunda coleta reutiliza token em cache (só 1 GET adicional).
    await transport.execute('collect', { serialNumber: 'TEST-SN-001' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const authCalls = fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/auth/token'));
    expect(authCalls).toHaveLength(1);
  });

  it('LIVE collect preserva o JSON AUXSOL completo, inclusive chaves irmãs de data', async () => {
    const fetchImpl = jest.fn(async (url: string | URL) => {
      if (String(url).endsWith('/auth/token')) {
        return jsonResponse(200, {
          code: AUXSOL_SUCCESS_CODE,
          data: { access_token: 'test-access-token', expires_in: 43200 },
        });
      }
      return jsonResponse(200, {
        code: AUXSOL_SUCCESS_CODE,
        msg: null,
        data: null,
        sn: 'TEST-SN-001',
        dt: '2026-09-10 15:30:00',
      });
    });
    const transport = new HttpAuxsolTransport({
      baseUrl: 'https://auxsol.example.test',
      appId: 'id',
      appSecret: 'secret',
      fetchImpl: fetchImpl as never,
    });
    await expect(transport.execute('collect', { serialNumber: 'TEST-SN-001' })).resolves.toMatchObject({
      code: AUXSOL_SUCCESS_CODE,
      data: null,
      sn: 'TEST-SN-001',
      dt: '2026-09-10 15:30:00',
    });
  });

  it('LIVE collect exige SN', async () => {
    const transport = new HttpAuxsolTransport({
      baseUrl: 'https://auxsol.example.test',
      appId: 'id',
      appSecret: 'secret',
      fetchImpl: jest.fn() as never,
    });
    await expect(transport.execute('collect', {})).rejects.toBeInstanceOf(AuxsolInvalidPayloadError);
  });

  it('LIVE falha com AuxsolAuthError sem APP_ID', async () => {
    const transport = new HttpAuxsolTransport({
      baseUrl: 'https://auxsol.example.test',
      appId: '',
      appSecret: 'secret',
      fetchImpl: jest.fn() as never,
    });
    await expect(transport.execute('testConnection')).rejects.toBeInstanceOf(AuxsolAuthError);
  });

  it('LIVE falha com AuxsolAuthError sem APP_SECRET', async () => {
    const transport = new HttpAuxsolTransport({
      baseUrl: 'https://auxsol.example.test',
      appId: 'id',
      appSecret: '',
      fetchImpl: jest.fn() as never,
    });
    await expect(transport.execute('testConnection')).rejects.toBeInstanceOf(AuxsolAuthError);
  });

  it('LIVE sem Base URL permanece bloqueado', async () => {
    const transport = new HttpAuxsolTransport({
      baseUrl: '',
      appId: 'id',
      appSecret: 'secret',
      fetchImpl: jest.fn() as never,
    });
    await expect(transport.execute('testConnection')).rejects.toBeInstanceOf(AuxsolContractUnavailableError);
  });

  it('LIVE listPlants chama GET /archive/plant/list com current e size', async () => {
    const fetchImpl = jest.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith('/auth/token')) {
        return jsonResponse(200, {
          code: AUXSOL_SUCCESS_CODE,
          data: { access_token: 'test-access-token', expires_in: 43200 },
        });
      }
      expect(href).toBe('https://auxsol.example.test/archive/plant/list?current=1&size=100');
      expect(init?.method).toBe('GET');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-access-token');
      return jsonResponse(200, { code: AUXSOL_SUCCESS_CODE, msg: null, data: { records: [] } });
    });
    const transport = new HttpAuxsolTransport({
      baseUrl: 'https://auxsol.example.test',
      appId: 'id',
      appSecret: 'secret',
      fetchImpl: fetchImpl as never,
    });
    await expect(transport.listPlants({ current: 1, size: 100 })).resolves.toMatchObject({
      code: AUXSOL_SUCCESS_CODE,
      data: { records: [] },
    });
  });

  it('LIVE getInvertersByPlant usa plantId no path', async () => {
    const fetchImpl = jest.fn(async (url: string | URL) => {
      if (String(url).endsWith('/auth/token')) {
        return jsonResponse(200, {
          code: AUXSOL_SUCCESS_CODE,
          data: { access_token: 'tok', expires_in: 1000 },
        });
      }
      expect(String(url)).toBe('https://auxsol.example.test/archive/inverter/getInverterByPlant/plant-1');
      return jsonResponse(200, { code: AUXSOL_SUCCESS_CODE, data: [] });
    });
    const transport = new HttpAuxsolTransport({
      baseUrl: 'https://auxsol.example.test',
      appId: 'id',
      appSecret: 'secret',
      fetchImpl: fetchImpl as never,
    });
    await expect(transport.getInvertersByPlant('plant-1')).resolves.toMatchObject({
      code: AUXSOL_SUCCESS_CODE,
      data: [],
    });
  });

  it('LIVE realtime propaga 401 como AuxsolAuthError', async () => {
    const fetchImpl = jest.fn(async (url: string | URL) => {
      if (String(url).endsWith('/auth/token')) {
        return jsonResponse(200, {
          code: AUXSOL_SUCCESS_CODE,
          data: { access_token: 'tok', expires_in: 1000 },
        });
      }
      return jsonResponse(401, { code: 'AWX-401', msg: 'unauthorized' });
    });
    const transport = new HttpAuxsolTransport({
      baseUrl: 'https://auxsol.example.test',
      appId: 'id',
      appSecret: 'secret',
      fetchImpl: fetchImpl as never,
    });
    await expect(transport.execute('collect', { serialNumber: 'SN1' })).rejects.toBeInstanceOf(AuxsolAuthError);
  });
});
