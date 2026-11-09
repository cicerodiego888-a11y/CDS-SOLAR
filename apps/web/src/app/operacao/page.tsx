'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../components/auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { LoadingState } from '../../components/ui/LoadingState';
import { MetricCard } from '../../components/ui/MetricCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { SelectField } from '../../components/ui/SelectField';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { TextField } from '../../components/ui/TextField';
import { OFFICIAL_INVERTER_MANUFACTURERS, getAlertSeverityLabel, getAlertStatusLabel } from '../../constants/inverters';
import { ApiError, fetchApi } from '../../lib/api';
import { DASHBOARD_POLL_MS } from '../../lib/dashboard';
import { healthLabel } from '../../lib/availability';
import { formatCoveragePercent, formatDateTime, formatEnergyKwh, formatPercentOrNd, formatRelativeTime } from '../../lib/format';
import { can, formatInstalledKwp } from '../../lib/operational';
import {
  OPERATIONS_EMPTY_ALERTS,
  OPERATIONS_EMPTY_ISSUES,
  OPERATIONS_EMPTY_PLANTS,
  OPERATIONS_ERROR,
  OPERATIONS_LOADING,
  OPERATIONS_PERIODS,
  OPERATIONS_STATUS_OPTIONS,
  buildOperationsQuery,
  operationsAlertHref,
  operationsInverterHref,
  operationsPlantHref,
  operationsStatusLabel,
} from '../../lib/operations-center';

type OperationsOverview = {
  period: string;
  health: { api: string; database: string; redis: string; status: string };
  summary: {
    plants: number;
    plantsOnline: number;
    plantsWarning: number;
    plantsOffline: number;
    inverters: number;
    invertersOnline: number;
    invertersWarning: number;
    invertersOffline: number;
    openAlerts: number;
  };
  plants: Array<{
    id: string;
    name: string;
    customerId: string;
    customerName: string | null;
    operationalStatus: string;
    installedPowerKwp: number | null;
    energyKwh: number | null;
    hasGeneration: boolean;
    inverterCount: number;
    activeAlerts: number;
    lastReadingAt: string | null;
    availabilityPercent?: number | null;
    coveragePercent?: number;
    health?: string;
    availabilityReason?: string;
  }>;
  inverterIssues: Array<{
    id: string;
    model: string | null;
    plantId: string;
    plantName: string;
    status: string;
    lastReadingAt: string | null;
    lastAlert: { id: string; title: string; severity: string } | null;
    availabilityPercent?: number | null;
    coveragePercent?: number;
    health?: string;
  }>;
  alerts: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    occurredAt: string;
    plantId: string;
    plantName: string | null;
    inverterId: string | null;
    inverterName: string | null;
  }>;
  recent: Array<{ type: string; at: string; label: string; plantId: string; inverterId?: string | null }>;
  empty: { plants: boolean; alerts: boolean; issues: boolean; readings: boolean };
};

type DiagnosisOverview = {
  total: number;
  critical: number;
  attention: number;
  affectedInverters: number;
  ratedPowerKw: number | null;
  incidents: Array<{
    code: string;
    title: string;
    severity: string;
    status: string;
    since?: string;
    plant: { id: string; name: string };
    inverter: { id: string; name: string | null };
    evidence: { manufacturer?: string | null; model?: string | null; serialNumber?: string | null; ratedPowerKw?: number | null };
    recommendedAction: string;
    alertReference?: { id: string; status: string };
  }>;
};

export default function OperacaoPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [period, setPeriod] = useState('today');
  const [status, setStatus] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [diagnosisFilter, setDiagnosisFilter] = useState('ALL');
  const [diagnosisPlantId, setDiagnosisPlantId] = useState('');
  const [diagnosisManufacturerId, setDiagnosisManufacturerId] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [customers, setCustomers] = useState<Array<{ value: string; label: string }>>([]);
  const [data, setData] = useState<OperationsOverview | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosisOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const canResolve = can(user, 'ALERTS_RESOLVE');
  const visibleIncidents = diagnostics?.incidents.filter((incident) => {
    if (diagnosisFilter === 'CRITICAL') return incident.severity === 'CRITICAL';
    if (diagnosisFilter === 'ATTENTION') return incident.status === 'ATTENTION' || incident.severity === 'WARNING';
    if (diagnosisFilter === 'INVERTER_OFFLINE' || diagnosisFilter === 'NO_RECENT_READING' || diagnosisFilter === 'INVERTER_ERROR' || diagnosisFilter === 'INVERTER_WARNING' || diagnosisFilter === 'INTEGRATION_NOT_CONFIGURED' || diagnosisFilter === 'INTEGRATION_BLOCKED') return incident.code === diagnosisFilter;
    return true;
  }) ?? [];

  useEffect(() => {
    if (user && !can(user, 'MONITORING_VIEW')) router.replace('/acesso-negado');
  }, [user, router]);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const diagnosisQuery = new URLSearchParams();
      if (appliedSearch.trim()) diagnosisQuery.set('search', appliedSearch.trim());
      if (customerId) diagnosisQuery.set('customerId', customerId);
      if (diagnosisPlantId) diagnosisQuery.set('plantId', diagnosisPlantId);
      if (diagnosisManufacturerId) diagnosisQuery.set('manufacturerId', diagnosisManufacturerId);
      if (['INVERTER_OFFLINE', 'NO_RECENT_READING', 'INVERTER_ERROR', 'INVERTER_WARNING', 'INTEGRATION_BLOCKED', 'INTEGRATION_NOT_CONFIGURED'].includes(diagnosisFilter)) diagnosisQuery.set('code', diagnosisFilter);
      const [overview, diagnosisOverview] = await Promise.all([
        fetchApi<OperationsOverview>(`/operations/overview?${buildOperationsQuery({
        period,
        status,
        customerId,
        search: appliedSearch,
        })}`),
        fetchApi<DiagnosisOverview>(`/monitoring/diagnostics/overview?${diagnosisQuery.toString()}`),
      ]);
      setData(overview);
      setDiagnostics(diagnosisOverview);
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err.message : OPERATIONS_ERROR);
    } finally {
      setLoading(false);
    }
  }, [period, status, customerId, appliedSearch, diagnosisFilter, diagnosisPlantId, diagnosisManufacturerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchApi<Array<{ id: string; name: string }>>('/customers')
      .then((rows) => setCustomers(rows.map((item) => ({ value: item.id, label: item.name }))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), DASHBOARD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function act(id: string, action: 'acknowledge' | 'resolve') {
    setActionError('');
    try {
      await fetchApi(`/alerts/${id}/${action}`, { method: action === 'acknowledge' ? 'POST' : 'PATCH' });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o alerta.');
    }
  }

  const periodLabel = OPERATIONS_PERIODS.find((item) => item.id === period)?.label ?? period;
  const appliedFilters = [
    `Período: ${periodLabel}`,
    status ? `Status: ${OPERATIONS_STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status}` : null,
    customerId ? `Cliente: ${customers.find((item) => item.value === customerId)?.label ?? customerId}` : null,
    appliedSearch.trim() ? `Busca: "${appliedSearch.trim()}"` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="shell operations-page">
      <PageHeader
        eyebrow="Operação"
        title="Central de Operação"
        description="Acompanhamento operacional das usinas, inversores e alertas."
        actions={(
          <div className="operations-header-actions">
            <span className="status operations-health">{data?.health.status === 'ok' ? 'Sistema operacional' : data ? `API ${data.health.api} · Banco ${data.health.database} · Redis ${data.health.redis}` : '—'}</span>
            {loading && data ? <span className="operations-refreshing" aria-live="polite">Atualizando…</span> : null}
            <Button type="button" variant="secondary" onClick={() => void load()}>Atualizar</Button>
          </div>
        )}
      />

      <section className="operations-panel operations-filters" aria-label="Filtros da Central de Operação">
        <div className="operations-filter-group">
          <h2 className="operations-group-label">Filtros gerais</h2>
          <div className="toolbar-filters">
            <SelectField
              id="op-period"
              label="Período"
              value={period}
              options={OPERATIONS_PERIODS.map((item) => ({ value: item.id, label: item.label }))}
              onChange={setPeriod}
            />
            <SelectField
              id="op-status"
              label="Status"
              value={status}
              placeholder="Todos"
              options={OPERATIONS_STATUS_OPTIONS}
              onChange={setStatus}
            />
            <SelectField
              id="op-customer"
              label="Cliente"
              value={customerId}
              placeholder="Todos"
              options={customers}
              onChange={setCustomerId}
            />
            <TextField
              id="op-search"
              label="Busca"
              value={search}
              placeholder="Usina, cliente ou inversor"
              onChange={setSearch}
            />
            <Button type="button" onClick={() => setAppliedSearch(search)}>Buscar</Button>
          </div>
        </div>
        <div className="operations-filter-group">
          <h2 className="operations-group-label">Filtros de incidentes</h2>
          <div className="toolbar-filters">
            <SelectField
              id="diagnosis-plant"
              label="Usina dos incidentes"
              value={diagnosisPlantId}
              placeholder="Todas"
              options={data?.plants.map((plant) => ({ value: plant.id, label: plant.name })) ?? []}
              onChange={setDiagnosisPlantId}
            />
            <SelectField
              id="diagnosis-manufacturer"
              label="Fabricante dos incidentes"
              value={diagnosisManufacturerId}
              placeholder="Todos"
              options={OFFICIAL_INVERTER_MANUFACTURERS.map((item) => ({ value: item.code, label: item.name }))}
              onChange={setDiagnosisManufacturerId}
            />
          </div>
        </div>
        <p className="operations-applied" aria-live="polite">{appliedFilters}</p>
      </section>

      {loading && !data ? <LoadingState message={OPERATIONS_LOADING} /> : null}
      {error ? <ErrorMessage title={OPERATIONS_ERROR} message={error} onAction={() => void load()} /> : null}
      {actionError ? <ErrorMessage message={actionError} /> : null}

      {data ? (
        <>
          <section className="operations-kpis" aria-label="Indicadores da operação">
            <div className="operations-kpi-group">
              <h2 className="operations-group-label">Usinas</h2>
              <div className="cards operations-cards">
                <MetricCard title="Usinas" value={data.summary.plants} note="Monitoradas" accent="blue" />
                <MetricCard title="Online" value={data.summary.plantsOnline} accent="green" />
                <MetricCard title="Atenção" value={data.summary.plantsWarning} accent="amber" />
                <MetricCard title="Offline" value={data.summary.plantsOffline} accent="red" />
              </div>
            </div>
            <div className="operations-kpi-group">
              <h2 className="operations-group-label">Inversores e alertas</h2>
              <div className="cards operations-cards operations-cards-compact">
                <MetricCard title="Inversores" value={data.summary.inverters} note={`${data.summary.invertersOnline} online`} accent="purple" />
                <MetricCard title="Alertas abertos" value={data.summary.openAlerts} accent="orange" />
              </div>
            </div>
          </section>

          <h2 className="operations-group-label operations-section-label">Atenção</h2>

          <section className="operations-panel">
            <SectionHeader
              title="Alertas prioritários"
              description="Somente abertos e reconhecidos, na ordem de severidade."
              actions={<Link href="/alertas"><Button type="button" variant="secondary">Ver alertas</Button></Link>}
            />
            <DataTable
              rows={data.alerts}
              rowKey={(row) => row.id}
              columns={[
                { key: 'title', header: 'Alerta', render: (row) => <Link className="operations-link operations-link-strong" href={operationsAlertHref(row.id)}>{row.title}</Link> },
                { key: 'plant', header: 'Usina', render: (row) => <Link className="operations-link" href={operationsPlantHref(row.plantId)}>{row.plantName || '—'}</Link> },
                {
                  key: 'inverter',
                  header: 'Inversor',
                  render: (row) => row.inverterId ? <Link className="operations-link" href={operationsInverterHref(row.inverterId)}>{row.inverterName || row.inverterId}</Link> : '—',
                },
                { key: 'severity', header: 'Severidade', render: (row) => <StatusBadge label={getAlertSeverityLabel(row.severity)} status={row.severity} /> },
                { key: 'status', header: 'Estado', render: (row) => getAlertStatusLabel(row.status) },
                {
                  key: 'actions',
                  header: 'Ações',
                  render: (row) => canResolve && row.status !== 'RESOLVED' ? (
                    <span className="actions-cell">
                      {row.status === 'OPEN' ? (
                        <Button variant="secondary" type="button" onClick={() => void act(row.id, 'acknowledge')}>Reconhecer</Button>
                      ) : null}
                      <Button variant="ghost" type="button" onClick={() => void act(row.id, 'resolve')}>Resolver</Button>
                    </span>
                  ) : null,
                },
              ]}
              empty={<EmptyState title={OPERATIONS_EMPTY_ALERTS} description="Não há incidentes abertos no momento." />}
            />
          </section>

          <section className="operations-panel">
            <SectionHeader
              title="Inversores com atenção"
              description="OFFLINE, ERROR e WARNING. Integração bloqueada não entra nesta lista."
            />
            <DataTable
              rows={data.inverterIssues}
              rowKey={(row) => row.id}
              columns={[
                { key: 'model', header: 'Inversor', render: (row) => <Link className="operations-link operations-link-strong" href={operationsInverterHref(row.id)}>{row.model || row.id}</Link> },
                { key: 'plant', header: 'Usina', render: (row) => <Link className="operations-link" href={operationsPlantHref(row.plantId)}>{row.plantName}</Link> },
                { key: 'status', header: 'Status', render: (row) => <StatusBadge label={operationsStatusLabel(row.status)} status={row.status} /> },
                { key: 'availability', header: 'Disponibilidade', render: (row) => formatPercentOrNd(row.availabilityPercent) },
                { key: 'coverage', header: 'Cobertura', render: (row) => formatCoveragePercent(row.coveragePercent ?? 0) },
                {
                  key: 'health',
                  header: 'Saúde',
                  render: (row) => <StatusBadge label={healthLabel(row.health, undefined)} status={row.health || 'NO_DATA'} />,
                },
                { key: 'last', header: 'Última leitura', render: (row) => formatRelativeTime(row.lastReadingAt) },
                {
                  key: 'alert',
                  header: 'Último alerta',
                  render: (row) => row.lastAlert ? <Link className="operations-link" href={operationsAlertHref(row.lastAlert.id)}>{row.lastAlert.title}</Link> : '—',
                },
              ]}
              empty={<EmptyState title={OPERATIONS_EMPTY_ISSUES} description="Nenhum inversor coletável apresenta falha." />}
            />
          </section>

          <h2 className="operations-group-label operations-section-label">Visão operacional</h2>

          <section className="operations-panel">
            <SectionHeader title="Situação das usinas" description="Geração do período pela mesma regra do histórico." />
            <DataTable
              rows={data.plants}
              rowKey={(row) => row.id}
              columns={[
                { key: 'name', header: 'Usina', render: (row) => <Link className="operations-link operations-link-strong" href={operationsPlantHref(row.id)}>{row.name}</Link> },
                { key: 'customer', header: 'Cliente', render: (row) => row.customerName || '—' },
                {
                  key: 'status',
                  header: 'Status',
                  render: (row) => <StatusBadge label={operationsStatusLabel(row.operationalStatus)} status={row.operationalStatus} />,
                },
                { key: 'power', header: 'Potência instalada', render: (row) => formatInstalledKwp(row.installedPowerKwp) },
                { key: 'energy', header: 'Geração', render: (row) => formatEnergyKwh(row.energyKwh, row.hasGeneration) },
                { key: 'inverters', header: 'Inversores', render: (row) => row.inverterCount },
                { key: 'availability', header: 'Disponibilidade', render: (row) => formatPercentOrNd(row.availabilityPercent) },
                { key: 'coverage', header: 'Cobertura', render: (row) => formatCoveragePercent(row.coveragePercent) },
                {
                  key: 'health',
                  header: 'Saúde',
                  render: (row) => <StatusBadge label={healthLabel(row.health, row.availabilityReason)} status={row.health} />,
                },
                { key: 'alerts', header: 'Alertas', render: (row) => row.activeAlerts },
                { key: 'last', header: 'Última leitura', render: (row) => formatRelativeTime(row.lastReadingAt) },
              ]}
              empty={<EmptyState title={OPERATIONS_EMPTY_PLANTS} description="Cadastre usinas para acompanhar a operação." />}
            />
          </section>

          <h2 className="operations-group-label operations-section-label">Diagnóstico e histórico</h2>

          <section className="operations-panel">
            <SectionHeader
              title="Incidentes Operacionais"
              description="Diagnósticos derivados dos alertas, leituras e estado da integração."
              actions={(
                <div className="operations-header-actions">
                  <span className="operations-incident-count">{diagnostics?.critical ?? 0} crítico(s) · {diagnostics?.attention ?? 0} em atenção</span>
                  <SelectField
                    id="diagnosis-filter"
                    label="Filtro de diagnóstico"
                    value={diagnosisFilter}
                    options={[
                      { value: 'CRITICAL', label: 'Críticos' },
                      { value: 'ATTENTION', label: 'Atenção' },
                      { value: 'INVERTER_OFFLINE', label: 'Sem comunicação' },
                      { value: 'NO_RECENT_READING', label: 'Sem leitura' },
                      { value: 'INVERTER_ERROR', label: 'Erro' },
                      { value: 'INVERTER_WARNING', label: 'Aviso' },
                      { value: 'INTEGRATION_BLOCKED', label: 'Integração bloqueada' },
                      { value: 'INTEGRATION_NOT_CONFIGURED', label: 'Integração não configurada' },
                    ]}
                    placeholder="Todos"
                    onChange={setDiagnosisFilter}
                  />
                </div>
              )}
            />
            {visibleIncidents.length ? (
              <DataTable
                rows={visibleIncidents}
                rowKey={(row) => `${row.inverter.id}-${row.code}`}
                columns={[
                  { key: 'inverter', header: 'Inversor', render: (row) => <Link className="operations-link operations-link-strong" href={operationsInverterHref(row.inverter.id)}>{row.inverter.name || row.inverter.id}</Link> },
                  { key: 'plant', header: 'Usina', render: (row) => <Link className="operations-link" href={operationsPlantHref(row.plant.id)}>{row.plant.name}</Link> },
                  { key: 'diagnosis', header: 'Diagnóstico', render: (row) => row.title },
                  { key: 'severity', header: 'Severidade', render: (row) => <StatusBadge label={getAlertSeverityLabel(row.severity)} status={row.severity} /> },
                  { key: 'manufacturer', header: 'Fabricante', render: (row) => row.evidence.manufacturer || 'Não informado' },
                  { key: 'power', header: 'Potência nominal', render: (row) => row.evidence.ratedPowerKw == null ? 'Não disponível' : `${row.evidence.ratedPowerKw} kWp` },
                  { key: 'since', header: 'Observado desde', render: (row) => row.since ? formatDateTime(row.since) : '—' },
                  {
                    key: 'action',
                    header: 'Ação',
                    render: (row) => (
                      <span className="actions-cell">
                        <Link href={operationsInverterHref(row.inverter.id)}><Button type="button" variant="secondary">Ver diagnóstico</Button></Link>
                        {row.alertReference && canResolve && row.alertReference.status !== 'RESOLVED' ? (
                          <Button variant="ghost" type="button" onClick={() => void act(row.alertReference!.id, row.alertReference!.status === 'OPEN' ? 'acknowledge' : 'resolve')}>
                            {row.alertReference.status === 'OPEN' ? 'Reconhecer' : 'Resolver'}
                          </Button>
                        ) : null}
                      </span>
                    ),
                  },
                ]}
                empty={<EmptyState title="Nenhum incidente operacional ativo." description="Não existem dados suficientes para diagnóstico." />}
              />
            ) : (
              <EmptyState title="Nenhum incidente operacional ativo." description="Não existem dados suficientes para diagnóstico." />
            )}
          </section>

          <section className="operations-panel">
            <SectionHeader title="Atualizações recentes" description="Leituras e alertas reais, sem eventos artificiais." />
            {data.recent.length ? (
              <ul className="alert-list operations-recent">
                {data.recent.map((item, index) => (
                  <li key={`${item.type}-${item.at}-${index}`}>
                    <div>
                      <strong>{item.label}</strong>
                      <p><span className="operations-event-type">{item.type === 'READING' ? 'Leitura' : 'Alerta'}</span></p>
                    </div>
                    <div className="alert-meta">
                      <span>{formatRelativeTime(item.at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nenhuma leitura disponível." description="A coleta ainda não persistiu eventos." />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
