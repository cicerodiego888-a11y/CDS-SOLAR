'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../components/auth/AuthProvider';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorMessage } from '../../../components/ui/ErrorMessage';
import { LoadingState } from '../../../components/ui/LoadingState';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ApiError, fetchApi } from '../../../lib/api';
import { MonitoringHistoryPanel } from '../../../components/monitoring/MonitoringHistoryPanel';
import { getAlertSeverityLabel, getAlertStatusLabel } from '../../../constants/inverters';
import { healthLabel, periodLabel } from '../../../lib/availability';
import { diagnosisStatusLabel } from '../../../lib/status-labels';
import {
  COLLECTION_IN_PROGRESS_MESSAGE,
  collectInverterLive,
  type LiveReadingPayload,
} from '../../../lib/collect-inverter';
import {
  formatCoveragePercent,
  formatDateTime,
  formatEnergyKwh,
  formatPercentOrNd,
  formatPowerKw,
} from '../../../lib/format';
import { resolveOperationalIntegrationState } from '../../../lib/integration-status';
import {
  overlayOperationalHealth,
  resolveInverterObservation,
} from '../../../lib/monitoring-coherence';
import {
  can,
  equipmentTypeLabel,
  formatInstalledKwp,
  formatPower,
  plantOperationalLabel,
  recordStatusLabel,
} from '../../../lib/operational';

type PlantBinding = {
  id?: string;
  provider: string;
  externalId?: string | null;
  status?: string | null;
  lastSyncAt?: string | null;
  lastErrorAt?: string | null;
  lastErrorMessage?: string | null;
};

type LiveReading = LiveReadingPayload;

type Plant = {
  id: string;
  name: string;
  status: string;
  installedPowerKw?: string | number | null;
  distributor?: string | null;
  consumerUnit?: string | null;
  consumerUnitId?: string | null;
  consumerUnitRef?: {
    id: string;
    number: string;
    contractAccount?: string | null;
    distributor?: { id: string; name: string } | null;
  } | null;
  address?: string | null;
  customer?: { id: string; name: string };
  inverters: Array<{
    id: string;
    model?: string | null;
    serialNumber?: string | null;
    ratedPowerKw?: string | number | null;
    status?: string | null;
    manufacturerRef?: { name: string; code?: string } | null;
    bindings?: PlantBinding[];
  }>;
  equipment: Array<{
    id: string;
    type: string;
    model?: string | null;
    serialNumber: string;
    status: string;
    inverterId?: string | null;
    inverter?: { id: string; model?: string | null; serialNumber?: string | null } | null;
  }>;
};

type PlantMonitoring = {
  kpis: {
    periodEnergyKwh: number | null;
    periodEnergyHasData?: boolean;
    currentPowerKw?: number | null;
    currentPowerHasData?: boolean;
    energyTodayKwh?: number | null;
    energyTodayHasData?: boolean;
    energyMonthKwh?: number | null;
    energyMonthHasData?: boolean;
    energyTotalKwh?: number | null;
    energyTotalHasData?: boolean;
    lastReadingAt?: string | null;
    installedPowerKwp: number | null;
    inverterCount: number;
    invertersOnline: number | null;
    invertersOffline: number | null;
    activeAlerts: number;
    comparisonPercent: number | null;
    performanceNote: string;
  };
  availability?: {
    availabilityPercent: number | null;
    coveragePercent: number;
    health: string;
    reason: string;
    period: string;
    eligibleInverters: number;
    observedInverters: number;
    invertersWithoutData: number;
    warningSeconds: number;
    offlineSeconds: number;
    errorSeconds: number;
  } | null;
  inverters?: Array<{
    id: string;
    model?: string | null;
    serialNumber?: string | null;
    ratedPowerKw?: number | null;
    status?: string | null;
    manufacturerName?: string | null;
    manufacturerCode?: string | null;
    lastReadingAt?: string | null;
    communicationOk?: boolean | null;
    powerKw?: number | null;
    powerHasData?: boolean;
    binding?: PlantBinding | null;
  }>;
  alerts: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    occurredAt: string;
    inverter?: { model?: string | null } | null;
  }>;
};

type PlantDiagnosis = {
  health: { status: string };
  availability: number | null;
  coverage: number;
  totalInverters: number;
  affectedInverters: number;
  critical: number;
  attention: number;
  ratedPowerKw: number | null;
  lastCommunication: string | null;
  summary: string;
  incidents: Array<{
    code: string;
    title: string;
    severity: string;
    status: string;
    since?: string;
    inverter: { id: string; name: string | null };
    evidence: { manufacturer?: string | null; ratedPowerKw?: number | null };
    recommendedAction: string;
    alertReference?: { id: string; status: string };
  }>;
};

function inverterIntegrationLabel(
  binding: PlantBinding | null | undefined,
  lastReadingAt?: string | null,
  communicationOk?: boolean | null,
) {
  return resolveOperationalIntegrationState({
    hasBinding: Boolean(binding),
    bindingStatus: binding?.status,
    externalId: binding?.externalId,
    lastReadingAt,
    communicationOk,
    lastErrorMessage: binding?.lastErrorMessage,
  }).label;
}

export default function UsinaDetalhePage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Plant | null>(null);
  const [monitoring, setMonitoring] = useState<PlantMonitoring | null>(null);
  const [diagnosis, setDiagnosis] = useState<PlantDiagnosis | null>(null);
  const [error, setError] = useState('');
  const [monitoringError, setMonitoringError] = useState('');
  const [liveByInverter, setLiveByInverter] = useState<Record<string, LiveReading | null>>({});
  const [liveError, setLiveError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const { user } = useAuth();
  const canResolve = can(user, 'ALERTS_RESOLVE');

  const loadLiveReadings = useCallback(async (plant: Plant) => {
    const targets = plant.inverters.filter((item) => {
      const binding = item.bindings?.[0];
      return Boolean(binding?.externalId && binding.provider === 'AUXSOL');
    });
    if (!targets.length) {
      setLiveByInverter({});
      setLiveError('');
      return;
    }
    const entries = await Promise.all(targets.map(async (item) => {
      const outcome = await collectInverterLive(item.id);
      if (outcome.status === 'ok') {
        return [item.id, outcome.result.liveReading ?? null, null as string | null] as const;
      }
      if (outcome.status === 'concurrent') {
        return [item.id, null, COLLECTION_IN_PROGRESS_MESSAGE] as const;
      }
      return [item.id, null, null as string | null] as const;
    }));
    let concurrent = false;
    let failed = 0;
    for (const [, reading, notice] of entries) {
      if (notice === COLLECTION_IN_PROGRESS_MESSAGE) concurrent = true;
      else if (!reading?.available) failed += 1;
    }
    setLiveByInverter((prev) => {
      const merged = { ...prev };
      for (const [id, reading, notice] of entries) {
        if (notice === COLLECTION_IN_PROGRESS_MESSAGE) {
          // Mantém leitura anterior; não trata como falha AUXSOL.
          continue;
        }
        merged[id] = reading;
      }
      return merged;
    });
    if (concurrent) {
      setLiveError(COLLECTION_IN_PROGRESS_MESSAGE);
    } else if (failed === targets.length) {
      setLiveError('Leitura ao vivo indisponível para os inversores AUXSOL desta usina.');
    } else {
      setLiveError('');
    }
  }, []);

  const load = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setError('');
    setMonitoringError('');
    try {
      const plant = await fetchApi<Plant>(`/plants/${params.id}`);
      setData(plant);
      await loadLiveReadings(plant);
      try {
        const [mon, diag] = await Promise.all([
          fetchApi<PlantMonitoring>(`/monitoring/plants/${params.id}/history?period=today`),
          fetchApi<PlantDiagnosis>(`/monitoring/diagnostics/plants/${params.id}`),
        ]);
        setMonitoring(mon);
        setDiagnosis(diag);
      } catch (err) {
        setMonitoring(null);
        setDiagnosis(null);
        setMonitoringError(err instanceof ApiError ? err.message : 'Não foi possível carregar o monitoramento.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a usina.');
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [params.id, loadLiveReadings]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: 'acknowledge' | 'resolve') {
    try {
      await fetchApi(`/alerts/${id}/${action}`, { method: action === 'acknowledge' ? 'POST' : 'PATCH' });
      const refreshed = await fetchApi<PlantDiagnosis>(`/monitoring/diagnostics/plants/${params.id}`);
      setDiagnosis(refreshed);
    } catch {
      setError('Não foi possível atualizar o alerta.');
    }
  }

  if (error && !data) {
    return (
      <div className="shell plants-detail">
        <ErrorMessage message={error} onAction={() => void load()} />
        <Link href="/usinas"><Button type="button" variant="secondary">Voltar para usinas</Button></Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="shell plants-detail">
        <LoadingState message="Carregando usina..." />
      </div>
    );
  }

  const liveReadings = Object.values(liveByInverter).filter((item): item is LiveReading => Boolean(item?.available));
  const liveSummary = liveReadings.length
    ? {
      powerKw: liveReadings.reduce((sum, item) => sum + (item.powerKw ?? 0), 0),
      powerHasData: liveReadings.some((item) => item.powerKw !== null),
      energyTodayKwh: liveReadings.reduce((sum, item) => sum + (item.energyTodayKwh ?? 0), 0),
      energyTodayHasData: liveReadings.some((item) => item.energyTodayKwh !== null),
      energyMonthKwh: liveReadings.reduce((sum, item) => sum + (item.energyMonthKwh ?? 0), 0),
      energyMonthHasData: liveReadings.some((item) => item.energyMonthKwh !== null),
      energyTotalKwh: liveReadings.reduce((sum, item) => sum + (item.energyTotalKwh ?? 0), 0),
      energyTotalHasData: liveReadings.some((item) => item.energyTotalKwh !== null),
      // collectedAt (não lastCommAt) para coerência de timestamps
      lastUpdate: liveReadings.map((item) => item.collectedAt).find(Boolean) || null,
    }
    : null;
  const lastUpdate = liveSummary?.lastUpdate
    || monitoring?.kpis.lastReadingAt
    || diagnosis?.lastCommunication
    || null;

  const inverterRows = (monitoring?.inverters?.length
    ? monitoring.inverters.map((row) => {
        const cadastro = data.inverters.find((item) => item.id === row.id);
        const binding = row.binding ?? cadastro?.bindings?.[0] ?? null;
        const observation = resolveInverterObservation({
          id: row.id,
          hasBinding: Boolean(binding),
          bindingStatus: binding?.status,
          externalId: binding?.externalId,
          lastErrorMessage: binding?.lastErrorMessage,
          persistedLastReadingAt: row.lastReadingAt,
          persistedCommunicationOk: row.communicationOk,
          live: liveByInverter[row.id],
        });
        return {
          id: row.id,
          model: row.model ?? cadastro?.model,
          serialNumber: row.serialNumber ?? cadastro?.serialNumber,
          ratedPowerKw: row.ratedPowerKw ?? cadastro?.ratedPowerKw,
          status: row.status ?? cadastro?.status,
          manufacturerName: row.manufacturerName ?? cadastro?.manufacturerRef?.name ?? null,
          lastReadingAt: observation.lastReadingAt,
          communicationOk: observation.communicationOk,
          observation,
          binding,
        };
      })
    : data.inverters.map((row) => {
        const binding = row.bindings?.[0] ?? null;
        const observation = resolveInverterObservation({
          id: row.id,
          hasBinding: Boolean(binding),
          bindingStatus: binding?.status,
          externalId: binding?.externalId,
          lastErrorMessage: binding?.lastErrorMessage,
          persistedLastReadingAt: null,
          persistedCommunicationOk: null,
          live: liveByInverter[row.id],
        });
        return {
          id: row.id,
          model: row.model,
          serialNumber: row.serialNumber,
          ratedPowerKw: row.ratedPowerKw,
          status: row.status,
          manufacturerName: row.manufacturerRef?.name ?? null,
          lastReadingAt: observation.lastReadingAt,
          communicationOk: observation.communicationOk,
          observation,
          binding,
        };
      }));

  const operationalOverlay = overlayOperationalHealth(
    monitoring?.availability,
    inverterRows.map((row) => row.observation),
    monitoring?.availability?.eligibleInverters ?? data.inverters.length,
  );
  const communicationSummary = {
    label: operationalOverlay.communicationLabel,
    detail: operationalOverlay.communicationDetail,
  };
  const operationalHealth = operationalOverlay.health
    || monitoring?.availability?.health
    || diagnosis?.health.status
    || 'NO_DATA';

  const knownError = inverterRows
    .map((row) => row.binding?.lastErrorMessage)
    .find((message) => Boolean(message)) || null;

  const formalUnit = data.consumerUnitRef || null;
  const legacyUnit = !formalUnit && data.consumerUnit ? data.consumerUnit : null;

  return (
    <div className="shell plants-detail">
      <PageHeader
        eyebrow="Usina"
        title={data.name}
        description={[
          data.customer?.name || null,
          data.address || null,
          formatInstalledKwp(data.installedPowerKw),
        ].filter(Boolean).join(' · ') || 'Ativo operacional'}
        actions={(
          <div className="plants-detail-actions">
            <StatusBadge label={healthLabel(operationalHealth, operationalOverlay.healthReason || monitoring?.availability?.reason)} status={operationalHealth} />
            <StatusBadge label={plantOperationalLabel(data.status)} status={data.status} />
            <Button type="button" variant="secondary" disabled={refreshing} onClick={() => void load()}>
              {refreshing ? 'Atualizando…' : 'Atualizar'}
            </Button>
            <Link href="/usinas"><Button type="button" variant="ghost">Voltar</Button></Link>
          </div>
        )}
      />

      <section className="plants-panel">
        <SectionHeader
          title="Dados da usina"
          description="Informações cadastrais do ativo operacional."
        />
        <dl className="detail-grid plants-identity-grid">
          <div>
            <dt>Cliente</dt>
            <dd>
              {data.customer?.id
                ? <Link href={`/clientes/${data.customer.id}`}>{data.customer.name}</Link>
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Potência instalada</dt>
            <dd>{formatInstalledKwp(data.installedPowerKw)}</dd>
          </div>
          <div>
            <dt>Endereço</dt>
            <dd>{data.address || '—'}</dd>
          </div>
          <div>
            <dt>Distribuidora / concessionária</dt>
            <dd>{formalUnit?.distributor?.name || data.distributor || '—'}</dd>
          </div>
          <div>
            <dt>Status de cadastro</dt>
            <dd><StatusBadge label={plantOperationalLabel(data.status)} status={data.status} /></dd>
          </div>
          <div>
            <dt>Última atualização</dt>
            <dd>{lastUpdate ? formatDateTime(lastUpdate) : '—'}</dd>
          </div>
          <div>
            <dt>Comunicação</dt>
            <dd>{communicationSummary.label}</dd>
          </div>
        </dl>
      </section>

      <section className="plants-panel">
        <SectionHeader
          title="Unidade consumidora"
          description="Relação energética vinculada à usina, quando existir."
        />
        {formalUnit ? (
          <dl className="detail-grid">
            <div>
              <dt>Unidade consumidora (formal)</dt>
              <dd>{formalUnit.number}</dd>
            </div>
            <div>
              <dt>Conta contrato</dt>
              <dd>{formalUnit.contractAccount || 'Não informada'}</dd>
            </div>
            <div>
              <dt>Distribuidora</dt>
              <dd>{formalUnit.distributor?.name || '—'}</dd>
            </div>
          </dl>
        ) : legacyUnit ? (
          <dl className="detail-grid">
            <div>
              <dt>Referência legada</dt>
              <dd>{legacyUnit}</dd>
            </div>
            <div>
              <dt>Observação</dt>
              <dd className="plants-muted">Campo Plant.consumerUnit — não é ConsumerUnit formal.</dd>
            </div>
          </dl>
        ) : (
          <EmptyState
            title="Sem unidade consumidora"
            description="Nenhuma UC formal vinculada e nenhuma referência legada cadastrada."
          />
        )}
      </section>

      <section className="plants-panel">
        <SectionHeader
          title="Resumo operacional"
          description="Leituras reais. Sem dado não é zero. Prefere leitura ao vivo AUXSOL quando disponível."
        />
        <div className="cards plants-kpi-cards">
          <article className="card">
            <span>Potência atual</span>
            <strong>{formatPowerKw(
              liveSummary?.powerHasData ? liveSummary.powerKw : (monitoring?.kpis.currentPowerKw ?? null),
              Boolean(liveSummary?.powerHasData || monitoring?.kpis.currentPowerHasData),
            )}</strong>
          </article>
          <article className="card">
            <span>Geração hoje</span>
            <strong>{formatEnergyKwh(
              liveSummary?.energyTodayHasData
                ? liveSummary.energyTodayKwh
                : (monitoring?.kpis.energyTodayKwh ?? monitoring?.kpis.periodEnergyKwh ?? null),
              Boolean(liveSummary?.energyTodayHasData || monitoring?.kpis.energyTodayHasData || monitoring?.kpis.periodEnergyHasData || (monitoring?.kpis.periodEnergyKwh != null)),
            )}</strong>
          </article>
          <article className="card">
            <span>Geração no mês</span>
            <strong>{formatEnergyKwh(
              liveSummary?.energyMonthHasData ? liveSummary.energyMonthKwh : (monitoring?.kpis.energyMonthKwh ?? null),
              Boolean(liveSummary?.energyMonthHasData || monitoring?.kpis.energyMonthHasData),
            )}</strong>
          </article>
          <article className="card">
            <span>Geração total</span>
            <strong>{formatEnergyKwh(
              liveSummary?.energyTotalHasData ? liveSummary.energyTotalKwh : (monitoring?.kpis.energyTotalKwh ?? null),
              Boolean(liveSummary?.energyTotalHasData || monitoring?.kpis.energyTotalHasData),
            )}</strong>
          </article>
          <article className="card"><span>Inversores online</span><strong>{liveSummary ? liveReadings.filter((item) => item.communicationOk !== false).length : (monitoring?.kpis.invertersOnline ?? '—')}</strong></article>
          <article className="card"><span>Alertas ativos</span><strong>{monitoring ? monitoring.kpis.activeAlerts : '—'}</strong></article>
        </div>
        {liveError ? <ErrorMessage message={liveError} /> : null}
        {monitoringError ? <ErrorMessage message={monitoringError} onAction={() => void load()} /> : null}
      </section>

      <section className="plants-panel">
        <SectionHeader
          title="Monitoramento do inversor"
          description="Resumo ao vivo dos inversores AUXSOL vinculados nesta usina."
        />
        <DataTable
          rows={data.inverters.filter((item) => item.bindings?.[0]?.provider === 'AUXSOL' || liveByInverter[item.id])}
          rowKey={(row) => row.id}
          columns={[
            { key: 'model', header: 'Modelo', render: (row) => <Link href={`/inversores/${row.id}`}>{row.model || 'Inversor'}</Link> },
            { key: 'serial', header: 'Serial', render: (row) => row.serialNumber || '—' },
            {
              key: 'power',
              header: 'Potência',
              render: (row) => formatPowerKw(liveByInverter[row.id]?.powerKw ?? null, Boolean(liveByInverter[row.id]?.available && liveByInverter[row.id]?.powerKw !== null)),
            },
            {
              key: 'today',
              header: 'Geração hoje',
              render: (row) => formatEnergyKwh(liveByInverter[row.id]?.energyTodayKwh ?? null, Boolean(liveByInverter[row.id]?.available && liveByInverter[row.id]?.energyTodayKwh !== null)),
            },
            {
              key: 'comm',
              header: 'Comunicação',
              render: (row) => {
                const live = liveByInverter[row.id];
                if (!live) return 'Indisponível';
                if (!live.available) return 'Indisponível';
                return live.communicationOk === false ? 'Sem comunicação' : 'OK';
              },
            },
            {
              key: 'updated',
              header: 'Última atualização',
              render: (row) => {
                const live = liveByInverter[row.id];
                if (!live?.available || !live.collectedAt) return 'Indisponível';
                return formatDateTime(live.collectedAt);
              },
            },
          ]}
          empty={<EmptyState title="Sem monitoramento AUXSOL" description="Nenhum inversor AUXSOL vinculado nesta usina." />}
        />
      </section>

      <section className="plants-panel">
        <SectionHeader
          title="Inversores"
          description="Identidade local, status e integração."
          actions={<Link href={`/inversores?usina=${data.id}`}><Button type="button" variant="secondary">Ver todos</Button></Link>}
        />
        <DataTable
          rows={inverterRows}
          rowKey={(row) => row.id}
          columns={[
            { key: 'manufacturer', header: 'Fabricante', render: (row) => row.manufacturerName || '—' },
            { key: 'model', header: 'Modelo', render: (row) => <Link href={`/inversores/${row.id}`}>{row.model || 'Inversor'}</Link> },
            { key: 'serial', header: 'Serial', render: (row) => row.serialNumber || '—' },
            { key: 'rated', header: 'Potência nominal', render: (row) => formatPower(row.ratedPowerKw) },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge label={recordStatusLabel(row.status)} status={row.status} /> },
            {
              key: 'integration',
              header: 'Integração',
              render: (row) => inverterIntegrationLabel(row.binding, row.lastReadingAt, row.communicationOk),
            },
            {
              key: 'lastReading',
              header: 'Última leitura',
              render: (row) => (row.lastReadingAt ? formatDateTime(row.lastReadingAt) : '—'),
            },
          ]}
          empty={<EmptyState title="Nenhum inversor" description="Cadastre o primeiro inversor desta usina." />}
        />
      </section>

      <section className="plants-panel">
        <SectionHeader
          title="Equipamentos"
          description="Gateway, datalogger, medidor, comunicação e outros."
          actions={<Link href={`/equipamentos?usina=${data.id}`}><Button type="button" variant="secondary">Ver todos</Button></Link>}
        />
        <DataTable
          rows={data.equipment}
          rowKey={(row) => row.id}
          columns={[
            { key: 'type', header: 'Tipo', render: (row) => equipmentTypeLabel(row.type) },
            { key: 'model', header: 'Modelo', render: (row) => row.model || '—' },
            { key: 'serial', header: 'Série', render: (row) => row.serialNumber },
            {
              key: 'inverter',
              header: 'Inversor associado',
              render: (row) => {
                if (!row.inverter && !row.inverterId) return '—';
                const label = row.inverter?.serialNumber || row.inverter?.model || row.inverterId;
                return row.inverter?.id || row.inverterId
                  ? <Link href={`/inversores/${row.inverter?.id || row.inverterId}`}>{label}</Link>
                  : '—';
              },
            },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge label={recordStatusLabel(row.status)} status={row.status} /> },
          ]}
          empty={<EmptyState title="Nenhum equipamento" description="Cadastre equipamentos desta usina." />}
        />
      </section>

      <section className="plants-panel">
        <SectionHeader
          title="Comunicação"
          description={communicationSummary.detail}
          actions={<StatusBadge label={communicationSummary.label} status={operationalHealth} />}
        />
        <div className="cards plants-kpi-cards">
          <article className="card"><span>Status</span><strong>{communicationSummary.label}</strong></article>
          <article className="card"><span>Última leitura</span><strong>{lastUpdate ? formatDateTime(lastUpdate) : '—'}</strong></article>
          <article className="card">
            <span>Integração</span>
            <strong>
              {inverterRows.some((row) => row.binding)
                ? inverterRows.map((row) => row.binding?.provider).filter(Boolean).join(', ') || '—'
                : 'Não configurado'}
            </strong>
          </article>
          <article className="card">
            <span>Fabricante</span>
            <strong>
              {[...new Set(inverterRows.map((row) => row.manufacturerName).filter(Boolean))].join(', ') || '—'}
            </strong>
          </article>
          <article className="card"><span>Erro conhecido</span><strong>{knownError || '—'}</strong></article>
          <article className="card">
            <span>Disponibilidade</span>
            <strong>{formatPercentOrNd(operationalOverlay.availabilityPercent)}</strong>
          </article>
        </div>
      </section>

      <section className="plants-panel">
        <SectionHeader
          title="Saúde operacional"
          description={
            operationalOverlay.coveragePercent == null && operationalOverlay.healthReason === 'LIVE_OBSERVATION'
              ? 'Leitura ao vivo reconhecida. Cobertura percentual exige histórico persistido.'
              : operationalOverlay.availabilityPercent == null
                ? 'Não há dados suficientes para calcular a disponibilidade.'
                : `Período: ${periodLabel(monitoring?.availability?.period)}.`
          }
        />
        <div className="cards plants-kpi-cards">
          <article className="card">
            <span>Saúde</span>
            <strong>
              <StatusBadge
                label={healthLabel(operationalOverlay.health, operationalOverlay.healthReason)}
                status={operationalOverlay.health || 'NO_DATA'}
              />
            </strong>
          </article>
          <article className="card"><span>Cobertura</span><strong>{formatCoveragePercent(operationalOverlay.coveragePercent)}</strong></article>
          <article className="card"><span>Inversores observados</span><strong>{operationalOverlay.observedInverters}</strong></article>
          <article className="card"><span>Sem dados</span><strong>{operationalOverlay.invertersWithoutData}</strong></article>
        </div>
      </section>

      <section className="plants-panel">
        <SectionHeader
          title="Diagnóstico operacional"
          description={diagnosis?.summary || 'Não existem dados suficientes para diagnóstico.'}
          actions={<StatusBadge label={diagnosisStatusLabel(diagnosis?.health.status)} status={diagnosis?.health.status || 'NO_DATA'} />}
        />
        <div className="cards plants-kpi-cards">
          <article className="card"><span>Disponibilidade</span><strong>{formatPercentOrNd(
            operationalOverlay.healthReason === 'LIVE_OBSERVATION'
              ? operationalOverlay.availabilityPercent
              : diagnosis?.availability,
          )}</strong></article>
          <article className="card"><span>Cobertura</span><strong>{formatCoveragePercent(
            operationalOverlay.healthReason === 'LIVE_OBSERVATION'
              ? operationalOverlay.coveragePercent
              : diagnosis?.coverage,
          )}</strong></article>
          <article className="card"><span>Inversores afetados</span><strong>{diagnosis?.affectedInverters ?? '—'}</strong></article>
          <article className="card"><span>Potência nominal afetada</span><strong>{diagnosis?.ratedPowerKw == null ? '—' : `${diagnosis.ratedPowerKw} kWp`}</strong></article>
          <article className="card"><span>Última comunicação</span><strong>{diagnosis?.lastCommunication ? formatDateTime(diagnosis.lastCommunication) : '—'}</strong></article>
        </div>
        <DataTable
          rows={diagnosis?.incidents ?? []}
          rowKey={(row) => `${row.inverter.id}-${row.code}`}
          columns={[
            { key: 'severity', header: 'Severidade', render: (row) => <StatusBadge label={getAlertSeverityLabel(row.severity)} status={row.severity} /> },
            { key: 'problem', header: 'Problema', render: (row) => row.title },
            { key: 'inverter', header: 'Inversor', render: (row) => <Link href={`/inversores/${row.inverter.id}`}>{row.inverter.name || row.inverter.id}</Link> },
            { key: 'manufacturer', header: 'Fabricante', render: (row) => row.evidence.manufacturer || '—' },
            { key: 'since', header: 'Desde', render: (row) => (row.since ? formatDateTime(row.since) : '—') },
            {
              key: 'action',
              header: 'Ação',
              render: (row) => (row.alertReference && canResolve && row.alertReference.status !== 'RESOLVED'
                ? (
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => void act(row.alertReference!.id, row.alertReference!.status === 'OPEN' ? 'acknowledge' : 'resolve')}
                  >
                    {row.alertReference.status === 'OPEN' ? 'Reconhecer' : 'Resolver'}
                  </Button>
                )
                : <Link href={`/inversores/${row.inverter.id}`}><Button type="button" variant="secondary">Ver diagnóstico</Button></Link>),
            },
          ]}
          empty={<EmptyState title="Nenhum incidente operacional ativo." description="Não existem dados suficientes para diagnóstico." />}
        />
      </section>

      <section className="plants-panel">
        <SectionHeader
          title="Alertas"
          description="Alertas reais derivados do monitoramento desta usina."
        />
        {monitoring ? (
          <DataTable
            rows={monitoring.alerts}
            rowKey={(row) => row.id}
            columns={[
              { key: 'title', header: 'Alerta', render: (row) => row.title },
              { key: 'inverter', header: 'Inversor', render: (row) => row.inverter?.model || '—' },
              { key: 'severity', header: 'Severidade', render: (row) => getAlertSeverityLabel(row.severity) },
              { key: 'status', header: 'Estado', render: (row) => getAlertStatusLabel(row.status) },
              { key: 'when', header: 'Horário', render: (row) => formatDateTime(row.occurredAt) },
            ]}
            empty={<EmptyState title="Nenhum alerta" description="Os alertas dos inversores desta usina aparecerão aqui." />}
          />
        ) : (
          <EmptyState title="Sem dados de alertas" description={monitoringError || 'Monitoramento indisponível no momento.'} />
        )}
      </section>

      <MonitoringHistoryPanel
        endpoint={`/monitoring/plants/${data.id}/history`}
        lockPlant
        plantId={data.id}
        inverters={data.inverters}
      />
    </div>
  );
}
