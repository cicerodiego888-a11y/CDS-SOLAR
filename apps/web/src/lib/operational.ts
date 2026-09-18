import type { AuthUser } from './auth-session';

export const RECORD_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'INACTIVE', label: 'Inativo' },
];

export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'CPF', label: 'CPF' },
  { value: 'CNPJ', label: 'CNPJ' },
];

export const PLANT_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Ativa' },
  { value: 'INACTIVE', label: 'Inativa' },
];

export const EQUIPMENT_TYPE_OPTIONS = [
  { value: 'INVERSOR', label: 'Inversor' },
  { value: 'DATALOGGER', label: 'Datalogger' },
  { value: 'GATEWAY', label: 'Gateway' },
  { value: 'MEDIDOR', label: 'Medidor' },
  { value: 'COMUNICACAO', label: 'Comunicação' },
  { value: 'OUTRO', label: 'Outro' },
];

export function recordStatusLabel(status?: string | null) {
  if (status === 'INACTIVE') return 'Inativo';
  if (status === 'ACTIVE') return 'Ativo';
  return status || '—';
}

export function plantOperationalLabel(status?: string | null) {
  if (status === 'INACTIVE') return 'Inativa';
  if (status === 'ACTIVE') return 'Ativa';
  if (status === 'WARNING') return 'Atenção';
  if (status === 'OFFLINE') return 'Offline';
  return status || '—';
}

export function equipmentTypeLabel(type?: string | null) {
  return EQUIPMENT_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type ?? '—';
}

export function can(user: AuthUser | null | undefined, permission: string) {
  return Boolean(user?.permissions?.includes(permission));
}

/** Aceita "10", "10,5" e "10.5". Vazio ou inválido retorna undefined. */
export function parsePowerKw(value: string) {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

export function formatPower(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString('pt-BR')} kW` : '—';
}

export function formatInstalledKwp(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString('pt-BR')} kWp` : '—';
}
