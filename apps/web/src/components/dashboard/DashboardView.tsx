'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { DataTable } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { ErrorMessage } from '../ui/ErrorMessage';
import { LoadingState } from '../ui/LoadingState';
import { MetricCard } from '../ui/MetricCard';
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
      <header className="dashboard-hero">
        <div>
          <div className="eyebrow">B7 Solar</div>
          <h1>Olá, {userName}</h1>
          <p>Panorama operacional das usinas em tempo real, com dados oficiais do monitoramento.</p>
          <small className="clock">{formatClock(now)}</small>
        </div>
        <span className="status">Sistema operacional</span>
      </header>

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
          <section className="cards dashboard-cards">
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
              accent="green"
            />
            <MetricCard
              title="Geração no mês"
              value={formatEnergyKwh(dashboard.energyMonth.valueKwh ?? null, dashboard.energyMonth.hasData)}
              accent="green"
            />
            <MetricCard
              title="Geração total"
              value={formatEnergyKwh(dashboard.energyTotal.valueKwh ?? null, dashboard.energyTotal.hasData)}
              accent="blue"
            />
            <MetricCard
              title="Usinas"
              value={dashboard.plants.total}
              accent="blue"
              breakdown={[
                { label: 'online', value: dashboard.plants.online, tone: 'success' },
                { label: 'offline', value: dashboard.plants.offline, tone: 'danger' },
              ]}
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
          </section>

          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-title">
                <div>
                  <h2>Geração de energia</h2>
                  <p>Valores provenientes das leituras normalizadas.</p>
                </div>
                <div className="period-filter" role="tablist" aria-label="Período">
                  {DASHBOARD_PERIODS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === period ? 'period-btn active' : 'period-btn'}
                      onClick={() => setPeriod(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
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
            <section className="panel">
              <div className="panel-title">
                <div>
                  <h2>Últimas usinas</h2>
                  <p>Dados consolidados do núcleo de monitoramento.</p>
                </div>
                <Link href="/usinas">
                  <Button variant="secondary">Ver todas</Button>
                </Link>
              </div>
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

            <section className="panel">
              <div className="panel-title">
                <div>
                  <h2>Alertas recentes</h2>
                  <p>Eventos reais registrados no sistema.</p>
                </div>
                <Link href="/alertas">
                  <Button variant="secondary">Ver todos</Button>
                </Link>
              </div>
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
