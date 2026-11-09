/** Agrega estado operacional de usina a partir dos inversores (Sprint 6/7). */
import { resolveOperationalIntegrationState } from './integration-status.ts';

export type OperationalIntegrationState =
  | 'NOT_CONFIGURED'
  | 'AWAITING_IDENTIFICATION'
  | 'CONFIGURED_AWAITING_DATA'
  | 'ONLINE'
  | 'NO_COMMUNICATION'
  | 'ERROR';

const PLANT_PRIORITY: OperationalIntegrationState[] = [
  'ERROR',
  'NO_COMMUNICATION',
  'ONLINE',
  'CONFIGURED_AWAITING_DATA',
  'AWAITING_IDENTIFICATION',
  'NOT_CONFIGURED',
];

export const PLANT_STATE_FILTERS = [
  { value: 'ALL', label: 'Todas' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'AWAITING_IDENTIFICATION', label: 'Aguardando integração' },
  { value: 'CONFIGURED_AWAITING_DATA', label: 'Aguardando dados' },
  { value: 'NO_COMMUNICATION', label: 'Sem comunicação' },
  { value: 'ERROR', label: 'Com erro' },
  { value: 'NOT_CONFIGURED', label: 'Sem dados / não configurado' },
] as const;

export function plantOperationalFilterLabel(state: OperationalIntegrationState) {
  if (state === 'ONLINE') return 'Online';
  if (state === 'AWAITING_IDENTIFICATION') return 'Aguardando integração';
  if (state === 'CONFIGURED_AWAITING_DATA') return 'Aguardando dados';
  if (state === 'NO_COMMUNICATION') return 'Sem comunicação';
  if (state === 'ERROR') return 'Com erro';
  return 'Sem dados';
}

export function resolvePlantOperationalIntegrationState(
  inverterStates: Array<{ state: OperationalIntegrationState }>,
): { state: OperationalIntegrationState; label: string } {
  if (!inverterStates.length) {
    return { state: 'NOT_CONFIGURED', label: plantOperationalFilterLabel('NOT_CONFIGURED') };
  }
  for (const candidate of PLANT_PRIORITY) {
    if (inverterStates.some((item) => item.state === candidate)) {
      return { state: candidate, label: plantOperationalFilterLabel(candidate) };
    }
  }
  return { state: 'NOT_CONFIGURED', label: plantOperationalFilterLabel('NOT_CONFIGURED') };
}

export function countPlantIntegrationStates(states: OperationalIntegrationState[]) {
  const counts = {
    total: states.length,
    online: 0,
    awaitingIdentification: 0,
    awaitingData: 0,
    noCommunication: 0,
    error: 0,
    notConfigured: 0,
  };
  for (const state of states) {
    if (state === 'ONLINE') counts.online += 1;
    else if (state === 'AWAITING_IDENTIFICATION') counts.awaitingIdentification += 1;
    else if (state === 'CONFIGURED_AWAITING_DATA') counts.awaitingData += 1;
    else if (state === 'NO_COMMUNICATION') counts.noCommunication += 1;
    else if (state === 'ERROR') counts.error += 1;
    else counts.notConfigured += 1;
  }
  return counts;
}

export { resolveOperationalIntegrationState };
