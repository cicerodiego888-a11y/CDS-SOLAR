export type OperationalIntegrationState =
  | 'NOT_CONFIGURED'
  | 'AWAITING_IDENTIFICATION'
  | 'CONFIGURED_AWAITING_DATA'
  | 'ONLINE'
  | 'NO_COMMUNICATION'
  | 'ERROR';

const DEFAULT_ONLINE_THRESHOLD_MS = 15 * 60 * 1000;

const PLANT_PRIORITY: OperationalIntegrationState[] = [
  'ERROR',
  'NO_COMMUNICATION',
  'ONLINE',
  'CONFIGURED_AWAITING_DATA',
  'AWAITING_IDENTIFICATION',
  'NOT_CONFIGURED',
];

export function resolveOperationalIntegrationState(input: {
  hasBinding?: boolean;
  bindingStatus?: string | null;
  externalId?: string | null;
  lastReadingAt?: string | Date | null;
  communicationOk?: boolean | null;
  onlineThresholdMs?: number;
  now?: Date;
}): OperationalIntegrationState {
  const status = input.bindingStatus ?? null;
  const hasBinding = Boolean(input.hasBinding) || Boolean(status);
  const threshold = input.onlineThresholdMs && input.onlineThresholdMs > 0
    ? input.onlineThresholdMs
    : DEFAULT_ONLINE_THRESHOLD_MS;
  const now = input.now ?? new Date();

  if (status === 'AUTH_ERROR' || status === 'COMMUNICATION_ERROR') return 'ERROR';
  if (!hasBinding) return 'NOT_CONFIGURED';
  if (!input.externalId) return 'AWAITING_IDENTIFICATION';
  if (!input.lastReadingAt) return 'CONFIGURED_AWAITING_DATA';

  const last = new Date(input.lastReadingAt);
  const age = now.getTime() - last.getTime();
  if (!Number.isFinite(age) || age > threshold || input.communicationOk === false) {
    return 'NO_COMMUNICATION';
  }
  return 'ONLINE';
}

export function resolvePlantOperationalIntegrationState(
  states: OperationalIntegrationState[],
): OperationalIntegrationState {
  if (!states.length) return 'NOT_CONFIGURED';
  for (const candidate of PLANT_PRIORITY) {
    if (states.includes(candidate)) return candidate;
  }
  return 'NOT_CONFIGURED';
}

export function countOperationalIntegrationStates(states: OperationalIntegrationState[]) {
  return {
    total: states.length,
    online: states.filter((s) => s === 'ONLINE').length,
    awaitingIdentification: states.filter((s) => s === 'AWAITING_IDENTIFICATION').length,
    awaitingData: states.filter((s) => s === 'CONFIGURED_AWAITING_DATA').length,
    noCommunication: states.filter((s) => s === 'NO_COMMUNICATION').length,
    error: states.filter((s) => s === 'ERROR').length,
    notConfigured: states.filter((s) => s === 'NOT_CONFIGURED').length,
  };
}
