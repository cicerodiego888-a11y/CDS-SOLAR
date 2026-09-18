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
  ONLINE: 'Online',
  OFFLINE: 'Offline',
  WARNING: 'Atenção',
  ERROR: 'Erro',
  UNKNOWN: 'Desconhecido',
};

export const PLANT_STATUS_LABELS: Record<PlantStatus, string> = {
  ACTIVE: 'Ativa',
  INACTIVE: 'Inativa',
  WARNING: 'Atenção',
  OFFLINE: 'Offline',
};

export const INTEGRATION_STATUS_LABELS: Record<ManufacturerIntegrationStatus, string> = {
  PLANNED: 'Planejada',
  READY: 'Pronta',
  ACTIVE: 'Ativa',
};

export function getInverterStatusLabel(status?: string | null): string {
  if (!status) return INVERTER_STATUS_LABELS.UNKNOWN;
  return INVERTER_STATUS_LABELS[status as InverterOperationalStatus] ?? INVERTER_STATUS_LABELS.UNKNOWN;
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
  INFO: 'Informação',
  WARNING: 'Atenção',
  CRITICAL: 'Crítico',
} as const;

export const ALERT_STATUS_LABELS = {
  OPEN: 'Aberto',
  ACKNOWLEDGED: 'Reconhecido',
  RESOLVED: 'Resolvido',
} as const;

export function getAlertSeverityLabel(severity?: string | null): string {
  if (!severity) return ALERT_SEVERITY_LABELS.INFO;
  return ALERT_SEVERITY_LABELS[severity as keyof typeof ALERT_SEVERITY_LABELS] ?? severity;
}

export function getAlertStatusLabel(status?: string | null): string {
  if (!status) return ALERT_STATUS_LABELS.OPEN;
  return ALERT_STATUS_LABELS[status as keyof typeof ALERT_STATUS_LABELS] ?? status;
}

export function getStatusTone(status?: string | null): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  const value = (status || '').toUpperCase();
  if (value === 'ONLINE' || value === 'ACTIVE' || value === 'RESOLVED' || value === 'HEALTHY' || value === 'SAUDÁVEL' || value === 'OPERATIONAL') return 'success';
  if (value === 'WARNING' || value === 'ACKNOWLEDGED' || value === 'PLANNED' || value === 'ATTENTION' || value === 'PENDING' || value === 'MAINTENANCE') return 'warning';
  if (value === 'ERROR' || value === 'CRITICAL' || value === 'OFFLINE') return 'danger';
  if (value === 'INFO' || value === 'INFORMATIONAL' || value === 'OPEN') return 'info';
  return 'neutral';
}
