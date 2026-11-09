import { UNAVAILABLE_LABEL } from './status-labels.ts';

const numberPt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function formatNumber(value: number) {
  return numberPt.format(value);
}

export function formatPowerKw(value: number | null, hasData: boolean) {
  if (!hasData || value === null) return '—';
  return `${formatNumber(value)} kW`;
}

export function formatEnergyKwh(value: number | null, hasData: boolean) {
  if (!hasData || value === null) return '—';
  if (Math.abs(value) >= 1000) {
    return `${formatNumber(value / 1000)} MWh`;
  }
  return `${formatNumber(value)} kWh`;
}

export function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(value?: string | Date | null, now = new Date()) {
  if (!value) return 'Nunca sincronizado';
  const date = new Date(value);
  const delta = now.getTime() - date.getTime();
  if (!Number.isFinite(delta) || delta < 0) return formatDateTime(date);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h atrás`;
  return formatDateTime(date);
}

export function formatPercentOrNd(value: number | null | undefined) {
  if (value === null || value === undefined) return UNAVAILABLE_LABEL;
  return `${formatNumber(value)}%`;
}

export function formatCoveragePercent(value: number | null | undefined) {
  if (value === null || value === undefined) return UNAVAILABLE_LABEL;
  return `${formatNumber(value)}%`;
}

export function formatObservedDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined || seconds <= 0) return '—';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours && minutes) return `${hours} h ${minutes} min`;
  if (hours) return `${hours} h`;
  if (minutes) return `${minutes} min`;
  return `${total} s`;
}

export function formatClock(value: Date) {
  return value.toLocaleString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}
