/**
 * Coerência entre leitura ao vivo e indicadores operacionais derivados do histórico.
 * Não inventa histórico; não trata ausência de persistência como ausência de monitoramento.
 */

import { resolveOperationalIntegrationState, type OperationalIntegrationState } from './integration-status.ts';

export type LiveReadingSnapshot = {
  available: boolean;
  collectedAt: string | null;
  lastCommAt: string | null;
  powerKw: number | null;
  energyTodayKwh: number | null;
  communicationOk: boolean | null;
  persisted?: boolean;
};

export type CoherenceInverterInput = {
  id: string;
  plantId?: string;
  hasBinding: boolean;
  bindingStatus?: string | null;
  externalId?: string | null;
  lastErrorMessage?: string | null;
  /** Timestamp da última leitura persistida (MonitoringReading.collectedAt). */
  persistedLastReadingAt?: string | null;
  persistedCommunicationOk?: boolean | null;
  live?: LiveReadingSnapshot | null;
};

export type CoherenceAvailabilityInput = {
  health?: string | null;
  reason?: string | null;
  coveragePercent?: number | null;
  observedInverters?: number | null;
  invertersWithoutData?: number | null;
  eligibleInverters?: number | null;
  availabilityPercent?: number | null;
};

export type CoherencePresentation = {
  lastReadingAt: string | null;
  /** Sempre collectedAt da leitura válida; nunca lastCommAt. */
  observationTimestamp: string | null;
  lastCommAt: string | null;
  communicationOk: boolean | null;
  source: 'live' | 'persisted' | 'none';
  integrationState: OperationalIntegrationState;
  powerKw: number | null;
  powerIsValidZero: boolean;
};

export type PlantCoherenceOverlay = {
  communicationLabel: string;
  communicationDetail: string;
  health: string;
  healthReason: string | null;
  /** null = N/D (sem base histórica para percentual). */
  coveragePercent: number | null;
  observedInverters: number;
  invertersWithoutData: number;
  availabilityPercent: number | null;
  historyIndependentOfLive: true;
};

/** Preferência: leitura ao vivo válida > leitura persistida. powerKw=0 é válido. */
export function resolveInverterObservation(input: CoherenceInverterInput, now = new Date()): CoherencePresentation {
  const live = input.live?.available ? input.live : null;
  if (live) {
    const observationTimestamp = live.collectedAt;
    const communicationOk = live.communicationOk;
    const state = resolveOperationalIntegrationState({
      hasBinding: input.hasBinding,
      bindingStatus: input.bindingStatus,
      externalId: input.externalId,
      lastReadingAt: observationTimestamp,
      communicationOk,
      lastErrorMessage: input.lastErrorMessage,
      now,
    });
    return {
      lastReadingAt: observationTimestamp,
      observationTimestamp,
      lastCommAt: live.lastCommAt,
      communicationOk,
      source: 'live',
      integrationState: state.state,
      powerKw: live.powerKw,
      powerIsValidZero: live.powerKw === 0,
    };
  }

  const persistedAt = input.persistedLastReadingAt ?? null;
  const state = resolveOperationalIntegrationState({
    hasBinding: input.hasBinding,
    bindingStatus: input.bindingStatus,
    externalId: input.externalId,
    lastReadingAt: persistedAt,
    communicationOk: input.persistedCommunicationOk,
    lastErrorMessage: input.lastErrorMessage,
    now,
  });
  return {
    lastReadingAt: persistedAt,
    observationTimestamp: persistedAt,
    lastCommAt: null,
    communicationOk: input.persistedCommunicationOk ?? null,
    source: persistedAt ? 'persisted' : 'none',
    integrationState: state.state,
    powerKw: null,
    powerIsValidZero: false,
  };
}

export function summarizePlantCommunication(
  observations: CoherencePresentation[],
): { label: string; detail: string } {
  if (!observations.length) {
    return { label: 'Sem inversores', detail: 'Cadastre o inversor para iniciar a integração.' };
  }
  const states = observations.map((item) => item.integrationState);
  if (states.includes('ERROR')) {
    return { label: 'Com erro', detail: 'Há falha de integração/coleta em ao menos um inversor.' };
  }
  if (states.includes('ONLINE')) {
    return { label: 'Online', detail: 'Existe leitura recente válida dentro do threshold.' };
  }
  if (states.includes('NO_COMMUNICATION')) {
    return { label: 'Sem comunicação', detail: 'Última leitura ultrapassou o threshold configurado.' };
  }
  if (states.includes('CONFIGURED_AWAITING_DATA')) {
    return { label: 'Aguardando dados', detail: 'Integração configurada; ainda sem leitura válida.' };
  }
  if (states.includes('AWAITING_IDENTIFICATION')) {
    return { label: 'Aguardando identificação', detail: 'Falta identidade externa oficial para consulta.' };
  }
  return { label: 'Não configurado', detail: 'Não existe binding/configuração de integração.' };
}

/**
 * Overlay de saúde/cobertura: leitura ao vivo conta como observação;
 * cobertura percentual histórica permanece N/D quando não há evidência persistida.
 */
export function overlayOperationalHealth(
  availability: CoherenceAvailabilityInput | null | undefined,
  observations: CoherencePresentation[],
  eligibleCount: number,
): PlantCoherenceOverlay {
  const liveObserved = observations.filter((item) => item.source === 'live');
  const hasLive = liveObserved.length > 0;
  const hasPersistedEvidence = (availability?.coveragePercent ?? 0) > 0
    || (availability?.observedInverters ?? 0) > 0
    || Boolean(availability?.availabilityPercent != null);

  const communication = summarizePlantCommunication(observations);

  if (hasLive && !hasPersistedEvidence) {
    const onlineLive = liveObserved.filter((item) => item.integrationState === 'ONLINE').length;
    const withoutLive = Math.max(0, eligibleCount - liveObserved.length);
    return {
      communicationLabel: communication.label,
      communicationDetail: communication.detail,
      health: onlineLive > 0 ? 'HEALTHY' : 'ATTENTION',
      healthReason: 'LIVE_OBSERVATION',
      coveragePercent: null,
      observedInverters: liveObserved.length,
      invertersWithoutData: withoutLive,
      availabilityPercent: null,
      historyIndependentOfLive: true,
    };
  }

  const baseObserved = availability?.observedInverters ?? 0;
  const observedInverters = hasLive
    ? Math.max(baseObserved, liveObserved.length)
    : baseObserved;

  const coveragePercent = hasPersistedEvidence
    ? (availability?.coveragePercent ?? 0)
    : (hasLive ? null : (availability?.coveragePercent ?? null));

  let health = availability?.health || 'NO_DATA';
  let healthReason = availability?.reason ?? null;
  if (hasLive && (health === 'NO_DATA' || !health)) {
    health = liveObserved.some((item) => item.integrationState === 'ONLINE') ? 'HEALTHY' : 'ATTENTION';
    healthReason = 'LIVE_OBSERVATION';
  }

  return {
    communicationLabel: communication.label,
    communicationDetail: communication.detail,
    health,
    healthReason,
    coveragePercent: coveragePercent === undefined ? null : coveragePercent,
    observedInverters,
    invertersWithoutData: hasLive
      ? Math.max(0, eligibleCount - observedInverters)
      : (availability?.invertersWithoutData ?? Math.max(0, eligibleCount - observedInverters)),
    availabilityPercent: hasPersistedEvidence
      ? (availability?.availabilityPercent ?? null)
      : (hasLive ? null : (availability?.availabilityPercent ?? null)),
    historyIndependentOfLive: true,
  };
}

/** Isolamento: observação de uma usina não entra na contagem de outra. */
export function filterObservationsByPlant(
  items: Array<CoherenceInverterInput & { plantId: string }>,
  plantId: string,
): CoherenceInverterInput[] {
  return items.filter((item) => item.plantId === plantId);
}

export function pickObservationTimestamp(live: LiveReadingSnapshot | null | undefined): {
  collectedAt: string | null;
  lastCommAt: string | null;
} {
  if (!live?.available) return { collectedAt: null, lastCommAt: null };
  return {
    collectedAt: live.collectedAt,
    lastCommAt: live.lastCommAt,
  };
}
