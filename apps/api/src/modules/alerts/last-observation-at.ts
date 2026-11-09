/**
 * Seleção da última observação válida para ausência de leitura (COERENCIA-03).
 * Entre collectedAt persistido e lastSyncAt do mesmo inversor/binding, usa o mais recente.
 *
 * Política de futuro: timestamps até now + futureSkewMs (default 5 min) são aceitos
 * (tolerância de clock skew). Além disso, são rejeitados.
 */

export const DEFAULT_FUTURE_SKEW_MS = 5 * 60 * 1000;

export type ObservationTimestampInput = {
  inverterId: string;
  /** Binding do mesmo inversor/provider; obrigatório para isolamento entre bindings. */
  bindingId?: string | null;
  /** MonitoringReading.collectedAt do próprio inversor. */
  persistedCollectedAt?: Date | string | null;
  /** IntegrationBinding.lastSyncAt do binding correspondente. */
  bindingLastSyncAt?: Date | string | null;
  now?: Date;
  /** Tolerância para clock skew futuro (ms). Default 5 min. */
  futureSkewMs?: number;
};

export function toValidObservationDate(
  value: Date | string | null | undefined,
  now: Date = new Date(),
  futureSkewMs: number = DEFAULT_FUTURE_SKEW_MS,
): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) return null;
  if (time > now.getTime() + futureSkewMs) return null;
  return date;
}

/**
 * Retorna o timestamp válido mais recente entre persistido e lastSyncAt.
 * null quando nenhum candidato é válido.
 */
export function selectLastObservationAt(input: ObservationTimestampInput): Date | null {
  const now = input.now ?? new Date();
  const skew = input.futureSkewMs ?? DEFAULT_FUTURE_SKEW_MS;
  const candidates = [
    toValidObservationDate(input.persistedCollectedAt, now, skew),
    toValidObservationDate(input.bindingLastSyncAt, now, skew),
  ].filter((item): item is Date => Boolean(item));

  if (!candidates.length) return null;
  return candidates.reduce((latest, item) => (item.getTime() > latest.getTime() ? item : latest));
}

/** Isolamento por inversor. */
export function selectLastObservationForInverter(
  targetInverterId: string,
  rows: Array<ObservationTimestampInput>,
): Date | null {
  const own = rows.find((row) => row.inverterId === targetInverterId);
  if (!own) return null;
  return selectLastObservationAt(own);
}

/** Isolamento por inversor + binding. */
export function selectLastObservationForBinding(
  targetInverterId: string,
  targetBindingId: string,
  rows: Array<ObservationTimestampInput>,
): Date | null {
  const own = rows.find(
    (row) => row.inverterId === targetInverterId && row.bindingId === targetBindingId,
  );
  if (!own) return null;
  return selectLastObservationAt(own);
}

/** @deprecated alias — manter compatibilidade com specs de auditoria. */
export const selectLastObservationAtProposed = selectLastObservationAt;

/** @deprecated espelho do ?? legado — apenas para contraste em auditoria. */
export function selectLastObservationAtCurrent(input: ObservationTimestampInput): Date | null {
  const now = input.now ?? new Date();
  const skew = input.futureSkewMs ?? DEFAULT_FUTURE_SKEW_MS;
  const persisted = toValidObservationDate(input.persistedCollectedAt, now, skew);
  if (persisted) return persisted;
  return toValidObservationDate(input.bindingLastSyncAt, now, skew);
}
