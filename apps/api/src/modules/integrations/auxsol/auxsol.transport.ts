import {
  AUXSOL_SUCCESS_CODE,
  auxsolAppId,
  auxsolAppSecret,
  auxsolInverterRealtimeBySnPath,
  auxsolInvertersByPlantPath,
  auxsolOfficialBaseUrl,
  auxsolPlantListPath,
  auxsolTimeoutMs,
  integrationLog,
  resolveAuxsolMode,
} from './auxsol.config';
import {
  AuxsolAuthError,
  AuxsolContractUnavailableError,
  AuxsolInvalidPayloadError,
  AuxsolRequestError,
  AuxsolTransientError,
} from './auxsol.errors';
import {
  AUXSOL_FIXTURE_VALID,
  AUXSOL_FIXTURE_EMPTY,
  AUXSOL_FIXTURE_OFFLINE,
  AUXSOL_OFFICIAL_REALTIME_FIXTURE,
} from './auxsol.fixtures';
import { AuxsolFetch, auxsolHttpRequest, withTimeout } from './auxsol.http';
import { AuxsolTokenManager } from './auxsol.token';

export type AuxsolOperation = 'testConnection' | 'collect';

export interface AuxsolTransport {
  mode: 'live' | 'mock' | 'blocked';
  execute(operation: AuxsolOperation, params?: Record<string, unknown>): Promise<unknown>;
}

export { withTimeout };

export class BlockedAuxsolTransport implements AuxsolTransport {
  readonly mode = 'blocked' as const;

  async execute(): Promise<never> {
    throw new AuxsolContractUnavailableError(
      'Comunicação real AUXSOL bloqueada: URL/contrato oficial não configurados.',
    );
  }
}

export class MockAuxsolTransport implements AuxsolTransport {
  readonly mode = 'mock' as const;

  constructor(private readonly scenario = 'valid') {}

  async execute(operation: AuxsolOperation): Promise<unknown> {
    if (this.scenario === 'auth') throw new AuxsolAuthError();
    if (this.scenario === 'timeout') throw new AuxsolTransientError('timeout');
    if (this.scenario === '429') throw new AuxsolTransientError('HTTP 429', 429);
    if (this.scenario === '500') throw new AuxsolTransientError('HTTP 500', 500);
    if (this.scenario === 'empty') return AUXSOL_FIXTURE_EMPTY;
    if (this.scenario === 'offline') return AUXSOL_FIXTURE_OFFLINE;
    if (this.scenario === 'official') return AUXSOL_OFFICIAL_REALTIME_FIXTURE;
    if (operation === 'testConnection') return { ok: true, fixture: true };
    return AUXSOL_FIXTURE_VALID;
  }
}

export type HttpAuxsolTransportOptions = {
  baseUrl?: string;
  appId?: string;
  appSecret?: string;
  timeoutMs?: number;
  fetchImpl?: AuxsolFetch;
  tokenManager?: AuxsolTokenManager;
  now?: () => number;
  refreshMarginMs?: number;
};

/**
 * Transport LIVE — Fase 1 auth + Fase 2 realtime por SN.
 */
export class HttpAuxsolTransport implements AuxsolTransport {
  readonly mode = 'live' as const;
  private tokenManager: AuxsolTokenManager | null = null;

  constructor(private readonly options: HttpAuxsolTransportOptions = {}) {}

  async execute(operation: AuxsolOperation, params: Record<string, unknown> = {}): Promise<unknown> {
    this.requireLiveConfig();
    const manager = this.getTokenManager(...this.credentials());

    if (operation === 'testConnection') {
      await manager.getAccessToken();
      return { ok: true, authenticated: true };
    }

    if (operation === 'collect') {
      const sn = resolveCollectSerialNumber(params);
      return this.getInverterRealtimeBySn(sn);
    }

    throw new AuxsolContractUnavailableError(`Operação AUXSOL não suportada: ${operation}`);
  }

  /**
   * GET /analysis/inverterReport/findInverterRealTimeInfoBySn/{sn}
   * Reutiliza TokenManager + Bearer da Fase 1. Sem retry próprio.
   */
  async getInverterRealtimeBySn(sn: string): Promise<unknown> {
    const trimmed = sn?.trim();
    if (!trimmed) {
      throw new AuxsolInvalidPayloadError('SN inválido para realtime AUXSOL.');
    }
    return this.authorizedGet(auxsolInverterRealtimeBySnPath(trimmed), 'realtimeBySn');
  }

  /**
   * GET /archive/plant/list?current=&size=
   * Descoberta read-only. Não persiste. Não altera collect.
   */
  async listPlants(params: { current?: number; size?: number } = {}): Promise<unknown> {
    const current = Number.isFinite(params.current) && (params.current ?? 0) > 0 ? Number(params.current) : 1;
    const size = Number.isFinite(params.size) && (params.size ?? 0) > 0 ? Number(params.size) : 100;
    return this.authorizedGet(auxsolPlantListPath({ current, size }), 'plantList');
  }

  /**
   * GET /archive/inverter/getInverterByPlant/{plantId}
   * Descoberta read-only. Não persiste. Não altera collect.
   */
  async getInvertersByPlant(plantId: string): Promise<unknown> {
    const trimmed = plantId?.trim();
    if (!trimmed) {
      throw new AuxsolInvalidPayloadError('plantId inválido para listagem de inversores AUXSOL.');
    }
    return this.authorizedGet(auxsolInvertersByPlantPath(trimmed), 'invertersByPlant');
  }

  private async authorizedGet(path: string, operation: string): Promise<unknown> {
    const [baseUrl, appId, appSecret] = this.credentials();
    const manager = this.getTokenManager(baseUrl, appId, appSecret);
    const accessToken = await manager.getAccessToken();
    const started = Date.now();

    try {
      const response = await auxsolHttpRequest({
        baseUrl,
        path,
        method: 'GET',
        accessToken,
        timeoutMs: this.options.timeoutMs ?? auxsolTimeoutMs(),
        fetchImpl: this.options.fetchImpl,
      });

      if (response.code && response.code !== AUXSOL_SUCCESS_CODE) {
        throw new AuxsolRequestError(
          typeof response.msg === 'string' && response.msg
            ? response.msg
            : `AUXSOL rejeitou ${operation} (code=${response.code}).`,
          response.status,
          response.code,
        );
      }

      console.info(integrationLog({
        operation,
        endpoint: path,
        status: 'success',
        httpStatus: response.status,
        durationMs: Date.now() - started,
      }));

      // Encaminha o JSON AUXSOL completo. Não reconstruir {code,msg,data} —
      // isso descartaria campos irmãos se a API os enviasse fora de data.
      const body = response.body && typeof response.body === 'object' && !Array.isArray(response.body)
        ? response.body as Record<string, unknown>
        : undefined;
      return {
        ...(body ?? {}),
        code: (typeof body?.code === 'string' ? body.code : undefined) ?? response.code ?? AUXSOL_SUCCESS_CODE,
        msg: (body && 'msg' in body ? body.msg : response.msg) ?? null,
        data: body && 'data' in body ? body.data : response.data,
      };
    } catch (error) {
      if (error instanceof AuxsolAuthError) {
        manager.invalidate();
      }
      throw error;
    }
  }

  async getAccessToken(): Promise<string> {
    const [baseUrl, appId, appSecret] = this.credentials();
    return this.getTokenManager(baseUrl, appId, appSecret).getAccessToken();
  }

  private requireLiveConfig() {
    const baseUrl = this.options.baseUrl ?? auxsolOfficialBaseUrl();
    if (!baseUrl) {
      throw new AuxsolContractUnavailableError(
        'Comunicação real AUXSOL bloqueada: URL/contrato oficial não configurados.',
      );
    }
    const appId = this.options.appId ?? auxsolAppId();
    const appSecret = this.options.appSecret ?? auxsolAppSecret();
    if (!appId || !appSecret) {
      throw new AuxsolAuthError(
        'Credenciais AUXSOL ausentes. Configure AUXSOL_APP_ID e AUXSOL_APP_SECRET no backend.',
      );
    }
  }

  private credentials(): [string, string, string] {
    const baseUrl = this.options.baseUrl ?? auxsolOfficialBaseUrl();
    const appId = this.options.appId ?? auxsolAppId();
    const appSecret = this.options.appSecret ?? auxsolAppSecret();
    if (!baseUrl) {
      throw new AuxsolContractUnavailableError(
        'Comunicação real AUXSOL bloqueada: URL/contrato oficial não configurados.',
      );
    }
    if (!appId || !appSecret) {
      throw new AuxsolAuthError(
        'Credenciais AUXSOL ausentes. Configure AUXSOL_APP_ID e AUXSOL_APP_SECRET no backend.',
      );
    }
    return [baseUrl, appId, appSecret];
  }

  private getTokenManager(baseUrl: string, appId: string, appSecret: string) {
    if (this.options.tokenManager) return this.options.tokenManager;
    if (!this.tokenManager) {
      this.tokenManager = new AuxsolTokenManager({
        baseUrl,
        appId,
        appSecret,
        timeoutMs: this.options.timeoutMs ?? auxsolTimeoutMs(),
        fetchImpl: this.options.fetchImpl,
        now: this.options.now,
        refreshMarginMs: this.options.refreshMarginMs,
      });
    }
    return this.tokenManager;
  }
}

/**
 * Decisão Fase 2: o endpoint oficial é por SN → usar Inverter.serialNumber.
 * IntegrationBinding.externalId permanece ID externo genérico (não SN).
 */
export function resolveCollectSerialNumber(params: Record<string, unknown> = {}) {
  const sn = typeof params.serialNumber === 'string' ? params.serialNumber.trim() : '';
  if (!sn) {
    throw new AuxsolInvalidPayloadError(
      'SN do inversor ausente. Cadastre Inverter.serialNumber para coleta AUXSOL por SN.',
    );
  }
  return sn;
}

export function createAuxsolTransport(scenario?: string): AuxsolTransport {
  const mode = resolveAuxsolMode();
  if (mode === 'mock') return new MockAuxsolTransport(scenario);
  if (mode === 'live') return new HttpAuxsolTransport();
  return new BlockedAuxsolTransport();
}
