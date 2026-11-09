'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { DataTable } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { ErrorMessage } from '../ui/ErrorMessage';
import { LoadingState } from '../ui/LoadingState';
import { MetricCard } from '../ui/MetricCard';
import { PageHeader } from '../ui/PageHeader';
import { SectionHeader } from '../ui/SectionHeader';
import { StatusBadge } from '../ui/StatusBadge';
import { Button } from '../ui/Button';
import {
  getAlertSeverityLabel,
  getAlertStatusLabel,
  getOperationalStatusLabel,
} from '../../constants/inverters';
import { comparisonLabel, DASHBOARD_PERIODS, DASHBOARD_POLL_MS, DashboardOverview, DashboardPeriod } from '../../lib/dashboard';
import { ApiError, fetchApi } from '../../lib/api';
import { formatClock, formatEnergyKwh, formatNumber, formatPowerKw, formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/AuthProvider';
import { firstName } from '../../lib/auth-session';
import { GenerationChart } from './GenerationChart';
import { PlantDistribution } from './PlantDistribution';

export function DashboardView() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<DashboardPeriod>('today');
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      setError('');
      const overview = await fetchApi<DashboardOverview>(`/monitoring/overview?period=${period}`);
      setData(overview);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError && err.status === 403) {
        setError('Você não possui permissão para acessar este recurso.');
        return;
      }
      setError('Não foi possível carregar os dados do painel.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    const poll = window.setInterval(() => void load(), DASHBOARD_POLL_MS);
    const clock = window.setInterval(() => setNow(new Date()), 30000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [load]);

  const dashboard = data?.dashboard;
  const userName = user ? firstName(user.name) : 'operador';

  return (
    <div className="shell dashboard">
      <PageHeader
        eyebrow="Dashboard"
        title={`Olá, ${userName}`}
        description="Visão geral da operação e geração das usinas monitoradas."
        actions={<time className="dashboard-clock" dateTime={now.toISOString()}>{formatClock(now)}</time>}
      />

      {loading && !dashboard ? <LoadingState message="Carregando painel..." /> : null}

      {error ? (
        <ErrorMessage
          title="Não foi possível carregar os dados do painel."
          message="Verifique a conexão com a API e tente novamente."
          onAction={() => {
            setLoading(true);
            void load();
          }}
        />
      ) : null}

      {dashboard ? (
        <>
          <section className="dashboard-kpis" aria-label="Indicadores principais">
            <div className="dashboard-kpi-group">
              <h2 className="dashboard-section-label">Geração</h2>
              <div className="cards dashboard-cards dashboard-cards-energy">
                <MetricCard
                  title="Potência atual"
                  value={formatPowerKw(dashboard.currentPower.valueKw ?? null, dashboard.currentPower.hasData)}
                  comparison={comparisonLabel(dashboard.currentPower.comparisonPercent)}
                  note={dashboard.currentPower.hasData ? undefined : 'Sem dados de monitoramento'}
                  accent="blue"
                />
                <MetricCard
                  title="Geração hoje"
                  value={formatEnergyKwh(dashboard.energyToday.valueKwh ?? null, dashboard.energyToday.hasData)}
                  comparison={comparisonLabel(dashboard.energyToday.comparisonPercent)}
                  note={dashboard.energyToday.hasData ? undefined : 'Sem dados de geração'}
                  accent="green"
                />
                <MetricCard
                  title="Geração no mês"
                  value={formatEnergyKwh(dashboard.energyMonth.valueKwh ?? null, dashboard.energyMonth.hasData)}
                  note={dashboard.energyMonth.hasData ? undefined : 'Sem dados de geração'}
                  accent="green"
                />
                <MetricCard
                  title="Geração total"
                  value={formatEnergyKwh(dashboard.energyTotal.valueKwh ?? null, dashboard.energyTotal.hasData)}
                  note={dashboard.energyTotal.hasData ? undefined : 'Sem dados de geração'}
                  accent="blue"
                />
              </div>
            </div>

            <div className="dashboard-kpi-group">
              <h2 className="dashboard-section-label">Operação</h2>
              <div className="cards dashboard-cards dashboard-cards-ops">
                <MetricCard
                  title="Usinas"
                  value={dashboard.plants.total}
                  accent="blue"
                  breakdown={[
                    { label: 'online', value: dashboard.integration?.online ?? dashboard.plants.online, tone: 'success' },
                    { label: 'erro', value: dashboard.integration?.error ?? 0, tone: 'danger' },
                  ]}
                />
                <MetricCard
                  title="Integração"
                  value={dashboard.integration?.awaitingIdentification ?? '—'}
                  note={dashboard.integration ? 'Aguardando identificação' : 'Sem dados de integração'}
                  accent="amber"
                  breakdown={dashboard.integration ? [
                    { label: 'aguard. dados', value: dashboard.integration.awaitingData, tone: 'warning' },
                    { label: 'sem com.', value: dashboard.integration.noCommunication, tone: 'danger' },
                  ] : undefined}
                />
                <MetricCard
                  title="Alertas"
                  value={dashboard.alerts.total}
                  accent="amber"
                  breakdown={[
                    { label: 'crítico', value: dashboard.alerts.critical, tone: 'danger' },
                    { label: 'atenção', value: dashboard.alerts.warning, tone: 'warning' },
                  ]}
                />
                <MetricCard
                  title="Clientes"
                  value={dashboard.customers.total}
                  note="Ativos no sistema"
                  accent="green"
                />
              </div>
            </div>
          </section>

          <div className="dashboard-grid">
            <section className="dashboard-panel dashboard-panel-chart">
              <SectionHeader
                title="Geração de energia"
                description="Valores provenientes das leituras normalizadas."
                actions={(
                  <div className="period-filter" role="tablist" aria-label="Período">
                    {DASHBOARD_PERIODS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={item.id === period}
                        className={item.id === period ? 'period-btn active' : 'period-btn'}
                        onClick={() => setPeriod(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              />
              <GenerationChart points={dashboard.generationSeries} />
            </section>

            <PlantDistribution
              online={dashboard.plants.online}
              offline={dashboard.plants.offline}
              maintenance={dashboard.plants.maintenance}
              plants={dashboard.recentPlants}
            />
          </div>

          <div className="dashboard-grid">
            <section className="dashboard-panel">
              <SectionHeader
                title="Últimas usinas"
                description="Dados consolidados do núcleo de monitoramento."
                actions={(
                  <Link href="/usinas">
                    <Button variant="secondary">Ver todas</Button>
                  </Link>
                )}
              />
              <DataTable
                rows={dashboard.recentPlants}
                rowKey={(row) => row.id}
                columns={[
                  { key: 'name', header: 'Usina', render: (row) => row.name },
                  { key: 'customer', header: 'Cliente', render: (row) => row.customerName || '—' },
                  {
                    key: 'power',
                    header: 'Potência',
                    render: (row) => (row.installedPowerKw === null ? 'Sem dados' : `${formatNumber(row.installedPowerKw)} kWp`),
                  },
                  {
                    key: 'today',
                    header: 'Geração hoje',
                    render: (row) => formatEnergyKwh(row.energyTodayKwh, row.energyTodayHasData),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (row) => (
                      <StatusBadge
                        label={getOperationalStatusLabel(row.operationalStatus, row.plantStatus)}
                        status={row.plantStatus === 'INACTIVE' ? 'UNKNOWN' : row.operationalStatus}
                      />
                    ),
                  },
                ]}
                empty={<EmptyState title="Nenhuma usina cadastrada" description="As usinas aparecerão aqui após o cadastro." />}
              />
            </section>

            <section className="dashboard-panel">
              <SectionHeader
                title="Alertas recentes"
                description="Eventos reais registrados no sistema."
                actions={(
                  <Link href="/alertas">
                    <Button variant="secondary">Ver todos</Button>
                  </Link>
                )}
              />
              {dashboard.recentAlerts.length ? (
                <ul className="alert-list">
                  {dashboard.recentAlerts.map((alert) => (
                    <li key={alert.id}>
                      <StatusBadge label={getAlertSeverityLabel(alert.severity)} status={alert.severity} />
                      <div>
                        <strong><Link href={`/alertas/${alert.id}`}>{alert.title}</Link></strong>
                        <p>
                          {[alert.plantName, alert.ruleCode, alert.manufacturerName].filter(Boolean).join(' · ') || 'Usina não informada'}
                        </p>
                      </div>
                      <div className="alert-meta">
                        <span>{formatDateTime(alert.occurredAt)}</span>
                        <small>{getAlertStatusLabel(alert.status)}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Nenhum alerta recente" description="Os eventos operacionais aparecerão nesta lista." />
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
