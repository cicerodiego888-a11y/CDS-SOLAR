export type PlantStatus = 'ACTIVE' | 'INACTIVE' | 'WARNING' | 'OFFLINE';
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export type InverterManufacturerCode =
  | 'AUXSOL'
  | 'SOLPLANET'
  | 'SAJ'
  | 'HUAWEI'
  | 'DEYE'
  | 'CHINT'
  | 'SUNGROW';

export type ManufacturerIntegrationStatus = 'PLANNED' | 'READY' | 'ACTIVE';

export type InverterOperationalStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'WARNING'
  | 'ERROR'
  | 'UNKNOWN';

export interface InverterManufacturer {
  id?: string;
  code: InverterManufacturerCode;
  name: string;
  active: boolean;
  integrationStatus: ManufacturerIntegrationStatus;
  capabilities: InverterManufacturerCapabilities;
}

export interface InverterManufacturerCapabilities {
  telemetry: boolean;
  alerts: boolean;
  remoteControl: boolean;
}

export interface PlantSummary {
  id: string;
  name: string;
  status: PlantStatus;
  installedPowerKw?: number;
  generationTodayKwh?: number;
  generationMonthKwh?: number;
}

/** Modelo normalizado já usado pelo núcleo (MonitoringReading). */
export interface InverterReading {
  powerKw?: number;
  energyTodayKwh?: number;
  energyMonthKwh?: number;
  energyTotalKwh?: number;
  voltage?: number;
  current?: number;
  temperature?: number;
  status?: InverterOperationalStatus;
  communicationOk: boolean;
  collectedAt: string | Date;
}

export const OFFICIAL_INVERTER_MANUFACTURERS: InverterManufacturer[] = [
  { code: 'AUXSOL', name: 'Auxsol', active: true, integrationStatus: 'PLANNED', capabilities: { telemetry: true, alerts: true, remoteControl: false } },
  { code: 'SOLPLANET', name: 'Solplanet', active: true, integrationStatus: 'PLANNED', capabilities: { telemetry: true, alerts: true, remoteControl: false } },
  { code: 'SAJ', name: 'SAJ', active: true, integrationStatus: 'PLANNED', capabilities: { telemetry: true, alerts: true, remoteControl: false } },
  { code: 'HUAWEI', name: 'Huawei', active: true, integrationStatus: 'PLANNED', capabilities: { telemetry: true, alerts: true, remoteControl: false } },
  { code: 'DEYE', name: 'Deye', active: true, integrationStatus: 'PLANNED', capabilities: { telemetry: true, alerts: true, remoteControl: false } },
  { code: 'CHINT', name: 'Chint', active: true, integrationStatus: 'PLANNED', capabilities: { telemetry: true, alerts: true, remoteControl: false } },
  { code: 'SUNGROW', name: 'Sungrow', active: true, integrationStatus: 'PLANNED', capabilities: { telemetry: true, alerts: true, remoteControl: false } },
];

const manufacturerByCode = new Map(
  OFFICIAL_INVERTER_MANUFACTURERS.map((manufacturer) => [manufacturer.code, manufacturer]),
);

export function getInverterManufacturer(code: string): InverterManufacturer | undefined {
  return manufacturerByCode.get(code as InverterManufacturerCode);
}

export function getInverterManufacturerName(code: string): string {
  return getInverterManufacturer(code)?.name ?? code;
}

export const INVERTER_STATUS_LABELS: Record<InverterOperationalStatus, string> = {
  ONLINE: 'Online',
  OFFLINE: 'Offline',
  WARNING: 'Em atenção',
  ERROR: 'Com erro',
  UNKNOWN: 'Não identificado',
};

export const PLANT_STATUS_LABELS: Record<PlantStatus, string> = {
  ACTIVE: 'Ativa',
  INACTIVE: 'Inativa',
  WARNING: 'Em atenção',
  OFFLINE: 'Offline',
};

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  INFO: 'Informação',
  WARNING: 'Em atenção',
  CRITICAL: 'Crítico',
};

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  OPEN: 'Aberto',
  ACKNOWLEDGED: 'Reconhecido',
  RESOLVED: 'Resolvido',
};

export const INTEGRATION_STATUS_LABELS: Record<ManufacturerIntegrationStatus, string> = {
  PLANNED: 'Planejada',
  READY: 'Pronta',
  ACTIVE: 'Ativa',
};

export function getInverterStatusLabel(status?: string | null): string {
  if (!status) return 'Não disponível';
  return INVERTER_STATUS_LABELS[status as InverterOperationalStatus] ?? INVERTER_STATUS_LABELS.UNKNOWN;
}

export function getPlantStatusLabel(status?: string | null): string {
  if (!status) return PLANT_STATUS_LABELS.INACTIVE;
  return PLANT_STATUS_LABELS[status as PlantStatus] ?? status;
}

export function getAlertSeverityLabel(severity?: string | null): string {
  if (!severity) return ALERT_SEVERITY_LABELS.INFO;
  return ALERT_SEVERITY_LABELS[severity as AlertSeverity] ?? severity;
}

export function getAlertStatusLabel(status?: string | null): string {
  if (!status) return ALERT_STATUS_LABELS.OPEN;
  return ALERT_STATUS_LABELS[status as AlertStatus] ?? status;
}

export function getIntegrationStatusLabel(status?: string | null): string {
  if (!status) return INTEGRATION_STATUS_LABELS.PLANNED;
  return INTEGRATION_STATUS_LABELS[status as ManufacturerIntegrationStatus] ?? status;
}
