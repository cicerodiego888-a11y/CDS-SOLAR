import {
  ALERT_SEVERITY_LABELS_PT,
  ALERT_STATUS_LABELS_PT,
  NORMALIZED_STATUS_LABELS,
  alertLifecycleLabel,
  alertSeverityLabel,
  normalizedStatusLabel,
} from '../lib/status-labels.ts';

export type InverterManufacturerCode =
  | 'AUXSOL'
  | 'SOLPLANET'
  | 'SAJ'
  | 'HUAWEI'
  | 'DEYE'
  | 'CHINT'
  | 'SUNGROW';

export type InverterOperationalStatus = 'ONLINE' | 'OFFLINE' | 'WARNING' | 'ERROR' | 'UNKNOWN';
export type PlantStatus = 'ACTIVE' | 'INACTIVE' | 'WARNING' | 'OFFLINE';
export type ManufacturerIntegrationStatus = 'PLANNED' | 'READY' | 'ACTIVE';

export const OFFICIAL_INVERTER_MANUFACTURERS = [
  { code: 'AUXSOL' as const, name: 'Auxsol' },
  { code: 'SOLPLANET' as const, name: 'Solplanet' },
  { code: 'SAJ' as const, name: 'SAJ' },
  { code: 'HUAWEI' as const, name: 'Huawei' },
  { code: 'DEYE' as const, name: 'Deye' },
  { code: 'CHINT' as const, name: 'Chint' },
  { code: 'SUNGROW' as const, name: 'Sungrow' },
];

const manufacturerNames = Object.fromEntries(
  OFFICIAL_INVERTER_MANUFACTURERS.map((item) => [item.code, item.name]),
) as Record<InverterManufacturerCode, string>;

export function getInverterManufacturerName(code?: string | null): string {
  if (!code) return 'Não informado';
  return manufacturerNames[code as InverterManufacturerCode] ?? code;
}

export const INVERTER_STATUS_LABELS: Record<InverterOperationalStatus, string> = {
  ONLINE: NORMALIZED_STATUS_LABELS.ONLINE,
  OFFLINE: NORMALIZED_STATUS_LABELS.OFFLINE,
  WARNING: NORMALIZED_STATUS_LABELS.WARNING,
  ERROR: NORMALIZED_STATUS_LABELS.ERROR,
  UNKNOWN: NORMALIZED_STATUS_LABELS.UNKNOWN,
};

export const PLANT_STATUS_LABELS: Record<PlantStatus, string> = {
  ACTIVE: 'Ativa',
  INACTIVE: 'Inativa',
  WARNING: NORMALIZED_STATUS_LABELS.WARNING,
  OFFLINE: NORMALIZED_STATUS_LABELS.OFFLINE,
};

export const INTEGRATION_STATUS_LABELS: Record<ManufacturerIntegrationStatus, string> = {
  PLANNED: 'Planejada',
  READY: 'Pronta',
  ACTIVE: 'Ativa',
};

export function getInverterStatusLabel(status?: string | null): string {
  return normalizedStatusLabel(status);
}

export function getPlantStatusLabel(status?: string | null): string {
  if (!status) return PLANT_STATUS_LABELS.INACTIVE;
  return PLANT_STATUS_LABELS[status as PlantStatus] ?? status;
}

export function getOperationalStatusLabel(status?: string | null, plantStatus?: string | null): string {
  if (plantStatus === 'INACTIVE') return 'Em manutenção';
  return getInverterStatusLabel(status);
}

export function getIntegrationStatusLabel(status?: string | null): string {
  if (!status) return INTEGRATION_STATUS_LABELS.PLANNED;
  return INTEGRATION_STATUS_LABELS[status as ManufacturerIntegrationStatus] ?? status;
}

export const ALERT_SEVERITY_LABELS = {
  INFO: ALERT_SEVERITY_LABELS_PT.INFO,
  WARNING: ALERT_SEVERITY_LABELS_PT.WARNING,
  CRITICAL: ALERT_SEVERITY_LABELS_PT.CRITICAL,
} as const;

export const ALERT_STATUS_LABELS = {
  OPEN: ALERT_STATUS_LABELS_PT.OPEN,
  ACKNOWLEDGED: ALERT_STATUS_LABELS_PT.ACKNOWLEDGED,
  RESOLVED: ALERT_STATUS_LABELS_PT.RESOLVED,
} as const;

export function getAlertSeverityLabel(severity?: string | null): string {
  return alertSeverityLabel(severity);
}

export function getAlertStatusLabel(status?: string | null): string {
  return alertLifecycleLabel(status);
}

export function getStatusTone(status?: string | null): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  const value = (status || '').toUpperCase();
  if (value === 'ONLINE' || value === 'ACTIVE' || value === 'RESOLVED' || value === 'HEALTHY' || value === 'SAUDÁVEL' || value === 'OPERATIONAL') return 'success';
  if (value === 'WARNING' || value === 'ACKNOWLEDGED' || value === 'PLANNED' || value === 'ATTENTION' || value === 'PENDING' || value === 'MAINTENANCE') return 'warning';
  if (value === 'ERROR' || value === 'CRITICAL' || value === 'OFFLINE') return 'danger';
  if (value === 'INFO' || value === 'INFORMATIONAL' || value === 'OPEN') return 'info';
  return 'neutral';
}
