export type NormalizedStatus = 'ONLINE' | 'OFFLINE' | 'WARNING' | 'ERROR' | 'UNKNOWN';

export type ConnectorCapability = 'testConnection' | 'collect';

/** Contrato interno. O adapter normaliza o fabricante; o núcleo não conhece campos externos. */
export interface NormalizedMonitoringData {
  externalPlantId?: string;
  externalInverterId?: string;
  /** Instantâneo da leitura. Ausente/inválido rejeita a leitura. Não inventar Date.now(). */
  collectedAt?: Date;
  /** Potência instantânea em kW. Nunca usar como energia. */
  powerKw?: number;
  energyTodayKwh?: number;
  energyMonthKwh?: number;
  energyTotalKwh?: number;
  voltage?: number;
  current?: number;
  frequency?: number;
  temperature?: number;
  dcPowerKw?: number;
  acPowerKw?: number;
  status?: NormalizedStatus;
  communicationOk: boolean;
  rawPayload?: unknown;
  externalReadingId?: string;
}

export type NormalizedInverterReading = NormalizedMonitoringData;

export interface ConnectorTestResult {
  ok: boolean;
  supported: boolean;
  mode: 'live' | 'mock' | 'blocked';
  message: string;
}

export interface ConnectorCollectContext {
  inverterId?: string;
  externalId?: string;
  serialNumber?: string;
  [key: string]: unknown;
}

export interface ConnectorRuntimeState {
  mode: 'live' | 'mock' | 'blocked';
  persistable: boolean;
  available: boolean;
}

export type CollectionErrorCode =
  | 'INTEGRATION_NOT_CONFIGURED'
  | 'INTEGRATION_NOT_SUPPORTED'
  | 'INTEGRATION_BLOCKED'
  | 'COLLECTION_FAILED'
  | 'INVALID_READING'
  | 'PERSISTENCE_FAILED'
  | 'CONCURRENT_COLLECTION';

/** Snapshot ao vivo para UI (sem raw sensível). Definido em live-reading.view.ts. */
export type CollectionLiveReading = {
  available: boolean;
  unavailableReason: string | null;
  collectedAt: string | null;
  powerKw: number | null;
  energyTodayKwh: number | null;
  energyMonthKwh: number | null;
  energyTotalKwh: number | null;
  communicationOk: boolean | null;
  status: string | null;
  equipmentStatus: string | null;
  lastCommAt: string | null;
  alarms: {
    present: boolean;
    summary: string;
    codes: Record<string, unknown> | null;
  } | null;
  persisted: boolean;
};

export interface CollectionResult {
  ok: boolean;
  inverterId: string;
  provider?: string;
  integrationId?: string;
  mode?: 'live' | 'mock' | 'blocked';
  readings: number;
  valid: number;
  persisted: number;
  skipped: number;
  lastSyncAt?: string | null;
  durationMs: number;
  code?: CollectionErrorCode;
  message: string;
  /** Leitura normalizada para exibição imediata (mesmo com persistência OFF). */
  liveReading?: CollectionLiveReading | null;
}

export interface MonitoringConnector {
  provider: string;
  capabilities(): ConnectorCapability[];
  runtimeState(): ConnectorRuntimeState;
  testConnection(config: Record<string, unknown>): Promise<ConnectorTestResult>;
  collect(config: ConnectorCollectContext): Promise<NormalizedMonitoringData[]>;
}
