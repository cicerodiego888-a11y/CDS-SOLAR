export type DashboardPeriod = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'previousMonth';

export const DASHBOARD_PERIODS: Array<{ id: DashboardPeriod; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: 'yesterday', label: 'Ontem' },
  { id: 'last7days', label: 'Últimos 7 dias' },
  { id: 'last30days', label: 'Últimos 30 dias' },
  { id: 'thisMonth', label: 'Este mês' },
  { id: 'previousMonth', label: 'Mês anterior' },
];

export const DASHBOARD_POLL_MS = Number(process.env.NEXT_PUBLIC_DASHBOARD_POLL_MS || 60000);

export type MetricValue = {
  valueKw?: number | null;
  valueKwh?: number | null;
  hasData: boolean;
  comparisonPercent?: number | null;
};

export type DashboardOverview = {
  totals: { plants: number; active: number; warning: number; offline: number; openAlerts: number };
  dashboard: {
    generatedAt: string;
    period: DashboardPeriod;
    currentPower: MetricValue;
    energyToday: MetricValue;
    energyMonth: MetricValue;
    energyTotal: MetricValue;
    plants: { total: number; online: number; offline: number; maintenance: number; warning: number };
    integration?: {
      total: number;
      online: number;
      awaitingIdentification: number;
      awaitingData: number;
      noCommunication: number;
      error: number;
      notConfigured: number;
    };
    alerts: { total: number; critical: number; warning: number; info: number };
    customers: { total: number };
    generationSeries: Array<{ label: string; valueKwh: number; collectedAt: string }>;
    recentPlants: Array<{
      id: string;
      name: string;
      customerName: string | null;
      installedPowerKw: number | null;
      energyTodayKwh: number | null;
      energyTodayHasData: boolean;
      currentPowerKw?: number | null;
      currentPowerHasData?: boolean;
      lastReadingAt?: string | null;
      openAlerts?: number;
      operationalStatus: string;
      integrationState?: string;
      plantStatus: string;
      latitude: number | null;
      longitude: number | null;
    }>;
    operationalPlants?: Array<{
      id: string;
      name: string;
      address?: string | null;
      customerName: string | null;
      currentPowerKw: number | null;
      currentPowerHasData: boolean;
      lastReadingAt: string | null;
      openAlerts: number;
      integrationState: string;
    }>;
    recentAlerts: Array<{
      id: string;
      title: string;
      severity: string;
      status: string;
      occurredAt: string;
      ruleCode?: string | null;
      plantName: string | null;
      manufacturerName: string | null;
    }>;
  };
};

export function comparisonLabel(percent?: number | null) {
  if (percent === null || percent === undefined) return undefined;
  const prefix = percent > 0 ? '+' : '';
  return `${prefix}${percent.toLocaleString('pt-BR')}%`;
}
