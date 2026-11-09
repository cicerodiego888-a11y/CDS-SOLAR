/** Estados operacionais de apresentação — derivados de dados existentes, sem migration. */
export type OperationalIntegrationState =
  | 'NOT_CONFIGURED'
  | 'AWAITING_IDENTIFICATION'
  | 'CONFIGURED_AWAITING_DATA'
  | 'ONLINE'
  | 'NO_COMMUNICATION'
  | 'ERROR';

/** Alinhado ao default de MONITORING_NO_READING_THRESHOLD_SECONDS (900s). */
const DEFAULT_ONLINE_THRESHOLD_MS = 15 * 60 * 1000;

const STATE_LABELS: Record<OperationalIntegrationState, string> = {
  NOT_CONFIGURED: 'Não configurado',
  AWAITING_IDENTIFICATION: 'Aguardando identificação',
  CONFIGURED_AWAITING_DATA: 'Configurado / aguardando dados',
  ONLINE: 'Online',
  NO_COMMUNICATION: 'Sem comunicação',
  ERROR: 'Com erro',
};

export function operationalIntegrationLabel(state: OperationalIntegrationState) {
  return STATE_LABELS[state];
}

/**
 * Calcula o estado operacional a partir de binding + leitura existentes.
 * Não inventa dados; empty ≠ online.
 */
export function resolveOperationalIntegrationState(input: {
  hasBinding?: boolean;
  bindingStatus?: string | null;
  externalId?: string | null;
  lastReadingAt?: string | Date | null;
  communicationOk?: boolean | null;
  lastErrorMessage?: string | null;
  onlineThresholdMs?: number;
  now?: Date;
}): { state: OperationalIntegrationState; label: string } {
  const status = input.bindingStatus ?? null;
  const hasBinding = Boolean(input.hasBinding) || Boolean(status);
  const threshold = input.onlineThresholdMs && input.onlineThresholdMs > 0
    ? input.onlineThresholdMs
    : DEFAULT_ONLINE_THRESHOLD_MS;
  const now = input.now ?? new Date();

  if (status === 'AUTH_ERROR' || status === 'COMMUNICATION_ERROR') {
    return { state: 'ERROR', label: STATE_LABELS.ERROR };
  }

  if (!hasBinding) {
    return { state: 'NOT_CONFIGURED', label: STATE_LABELS.NOT_CONFIGURED };
  }

  if (!input.externalId) {
    return { state: 'AWAITING_IDENTIFICATION', label: STATE_LABELS.AWAITING_IDENTIFICATION };
  }

  if (!input.lastReadingAt) {
    return { state: 'CONFIGURED_AWAITING_DATA', label: STATE_LABELS.CONFIGURED_AWAITING_DATA };
  }

  const last = new Date(input.lastReadingAt);
  const age = now.getTime() - last.getTime();
  if (!Number.isFinite(age) || age > threshold || input.communicationOk === false) {
    return { state: 'NO_COMMUNICATION', label: STATE_LABELS.NO_COMMUNICATION };
  }

  return { state: 'ONLINE', label: STATE_LABELS.ONLINE };
}

/** Rótulos legados de binding (detalhe do inversor). Preferir resolveOperationalIntegrationState na Central da Usina. */
export function integrationBindingLabel(input: {
  manufacturerCode?: string | null;
  status?: string | null;
  lastErrorMessage?: string | null;
  hasBinding?: boolean;
}) {
  const status = input.status ?? null;
  if (status === 'AUTH_ERROR' || status === 'COMMUNICATION_ERROR') {
    return 'Falha na comunicação';
  }
  if (status === 'READY' || status === 'CONNECTED') {
    return 'Configuração pronta';
  }
  if (!input.hasBinding && !status) {
    return 'Integração não configurada';
  }
  if (
    status === 'BLOCKED'
    || /bloquead|contrato oficial/i.test(input.lastErrorMessage ?? '')
    || input.manufacturerCode === 'AUXSOL'
    || (input.manufacturerCode && input.manufacturerCode !== 'AUXSOL')
  ) {
    return 'Integração aguardando configuração/contrato oficial';
  }
  return 'Integração não configurada';
}
