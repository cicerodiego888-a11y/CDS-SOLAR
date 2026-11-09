export type AvailabilityReason =
  | 'OK'
  | 'NO_DATA'
  | 'INTEGRATION_BLOCKED'
  | 'INTEGRATION_NOT_CONFIGURED'
  | 'NOT_SUPPORTED'
  | 'INACTIVE'
  | 'NO_ELIGIBLE_INVERTERS';

export type OperationalHealth = 'HEALTHY' | 'ATTENTION' | 'CRITICAL' | 'NO_DATA';

export function healthLabel(health?: string | null, reason?: string | null) {
  if (reason === 'INTEGRATION_BLOCKED') return 'Integração bloqueada';
  if (reason === 'INTEGRATION_NOT_CONFIGURED' || reason === 'NOT_SUPPORTED') return 'Não configurado';
  if (reason === 'LIVE_OBSERVATION' && health === 'HEALTHY') return 'Observado ao vivo';
  if (reason === 'LIVE_OBSERVATION' && health === 'ATTENTION') return 'Atenção (ao vivo)';
  if (health === 'HEALTHY') return 'Saudável';
  if (health === 'ATTENTION') return 'Atenção';
  if (health === 'CRITICAL') return 'Crítico';
  return 'Sem dados';
}

export function healthTone(health?: string | null) {
  if (health === 'HEALTHY') return 'HEALTHY';
  if (health === 'ATTENTION') return 'ATTENTION';
  if (health === 'CRITICAL') return 'CRITICAL';
  return 'NO_DATA';
}

export function periodLabel(period?: string | null) {
  if (period === 'yesterday') return 'Ontem';
  if (period === 'last7days') return 'Últimos 7 dias';
  if (period === 'last30days') return 'Últimos 30 dias';
  if (period === 'thisMonth') return 'Este mês';
  if (period === 'custom') return 'Período personalizado';
  return 'Hoje';
}
