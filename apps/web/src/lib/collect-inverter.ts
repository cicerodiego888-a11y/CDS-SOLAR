/**
 * Deduplicação de coleta manual por inverterId (módulo compartilhado).
 * Sobrevive a remounts do React Strict Mode; não substitui o Redis lock.
 */

export const COLLECTION_IN_PROGRESS_MESSAGE = 'Coleta em andamento. Aguarde a conclusão.';

export type LiveReadingPayload = {
  available: boolean;
  unavailableReason: string | null;
  collectedAt: string | null;
  powerKw: number | null;
  energyTodayKwh: number | null;
  energyMonthKwh: number | null;
  energyTotalKwh: number | null;
  communicationOk: boolean | null;
  lastCommAt: string | null;
  alarms: { present: boolean; summary: string } | null;
  persisted: boolean;
};

export type CollectInverterResult = {
  ok: boolean;
  liveReading?: LiveReadingPayload | null;
  message?: string;
  code?: string;
};

export type CollectInverterOutcome =
  | { status: 'ok'; result: CollectInverterResult }
  | { status: 'concurrent'; message: string }
  | { status: 'error'; message: string; code?: string; statusCode?: number };

type FetchCollect = (path: string, init?: RequestInit) => Promise<CollectInverterResult>;

type ApiLikeError = {
  status: number;
  message: string;
  code?: string;
};

/** Registro compartilhado: uma Promise pendente por inversor. */
const pendingByInverter = new Map<string, Promise<CollectInverterOutcome>>();

function asApiLikeError(error: unknown): ApiLikeError | null {
  if (!error || typeof error !== 'object') return null;
  const row = error as { status?: unknown; message?: unknown; code?: unknown };
  if (typeof row.status !== 'number') return null;
  const message = typeof row.message === 'string'
    ? row.message
    : error instanceof Error
      ? error.message
      : '';
  return {
    status: row.status,
    message,
    code: typeof row.code === 'string' ? row.code : undefined,
  };
}

export function isConcurrentCollectionError(error: unknown): boolean {
  const apiError = asApiLikeError(error);
  if (!apiError) return false;
  if (apiError.code === 'CONCURRENT_COLLECTION') return true;
  return apiError.status === 409
    && /coleta em andamento|CONCURRENT_COLLECTION/i.test(apiError.message);
}

export function isCollectInFlight(inverterId?: string): boolean {
  if (inverterId) return pendingByInverter.has(inverterId);
  return pendingByInverter.size > 0;
}

/** Exposto só para testes — limpa o mapa de pendências. */
export function resetCollectInverterDedupeForTests() {
  pendingByInverter.clear();
}

async function defaultFetchCollect(path: string, init?: RequestInit): Promise<CollectInverterResult> {
  const { fetchApi } = await import('./api.ts');
  return fetchApi<CollectInverterResult>(path, init);
}

/**
 * Dispara POST /integrations/collect/:id com dedupe por inverterId.
 * Callers concorrentes recebem a mesma Promise até sucesso ou falha.
 */
export function collectInverterLive(
  inverterId: string,
  fetchCollect: FetchCollect = defaultFetchCollect,
): Promise<CollectInverterOutcome> {
  const id = inverterId?.trim();
  if (!id) {
    return Promise.resolve({ status: 'error', message: 'Inversor inválido.' });
  }

  const existing = pendingByInverter.get(id);
  if (existing) return existing;

  let pending!: Promise<CollectInverterOutcome>;
  pending = (async (): Promise<CollectInverterOutcome> => {
    try {
      const result = await fetchCollect(`/integrations/collect/${id}`, { method: 'POST' });
      return { status: 'ok', result };
    } catch (error) {
      if (isConcurrentCollectionError(error)) {
        return {
          status: 'concurrent',
          message: COLLECTION_IN_PROGRESS_MESSAGE,
        };
      }
      const apiError = asApiLikeError(error);
      return {
        status: 'error',
        message: apiError?.message || (error instanceof Error ? error.message : 'Não foi possível obter a leitura ao vivo.'),
        code: apiError?.code,
        statusCode: apiError?.status,
      };
    } finally {
      if (pendingByInverter.get(id) === pending) {
        pendingByInverter.delete(id);
      }
    }
  })();

  pendingByInverter.set(id, pending);
  return pending;
}
