'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../components/auth/AuthProvider';
import { Button } from '../../../components/ui/Button';
import { ErrorMessage } from '../../../components/ui/ErrorMessage';
import { LoadingState } from '../../../components/ui/LoadingState';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ApiError, fetchApi } from '../../../lib/api';
import { MonitoringHistoryPanel } from '../../../components/monitoring/MonitoringHistoryPanel';
import { getAlertSeverityLabel, getAlertStatusLabel } from '../../../constants/inverters';
import { healthLabel, periodLabel } from '../../../lib/availability';
import { formatCoveragePercent, formatEnergyKwh, formatObservedDuration, formatPercentOrNd } from '../../../lib/format';
import { can, formatPower, recordStatusLabel } from '../../../lib/operational';
import { integrationBindingLabel } from '../../../lib/integration-status';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState } from '../../../components/ui/EmptyState';

type Binding = {
  provider: string;
  externalId?: string | null;
  status?: string | null;
  lastSyncAt?: string | null;
  lastErrorAt?: string | null;
  lastErrorMessage?: string | null;
};

type Inverter = {
  id: string;
  model?: string | null;
  serialNumber?: string | null;
  ratedPowerKw?: string | number | null;
  externalId?: string | null;
  status?: string | null;
  plant?: { id: string; name: string; customer?: { id: string; name: string } };
  manufacturerRef?: { name: string; code: string } | null;
  bindings?: Binding[];
  equipment?: Array<{
    id: string;
    type: string;
    serialNumber: string;
    manufacturerName?: string | null;
    model?: string | null;
  }>;
};

type InverterMonitoring = {
  latestReading: {
    collectedAt: string;
    powerKw: number | null;
    energyTodayKwh: number | null;
    energyTotalKwh: number | null;
    communicationOk: boolean;
  } | null;
  emptyReadingMessage?: string | null;
  history: { energyKwh: number | null; hasData: boolean };
  availability?: {
    availabilityPercent: number | null;
    coveragePercent: number;
    health: string;
    reason: string;
    period: string;
    lastObservedStatus: string | null;
    onlineSeconds: number;
    warningSeconds: number;
    offlineSeconds: number;
    errorSeconds: number;
    observedSeconds: number;
  } | null;
  alerts: Array<{ id: string; title: string; severity: string; status: string; occurredAt: string }>;
};

type OperationalDiagnosisResponse = {
  diagnosis: {
    code: string;
    title: string;
    severity: string;
    status: string;
    since?: string;
    durationSeconds?: number;
    evidence: { normalizedStatus?: string | null; availability?: number | null; coverage?: number | null; equipmentCode?: string | null; equipmentMessage?: string | null };
    recommendedAction: string;
  } | null;
  timeline: Array<{ type: string; at: string; label: string; status?: string | null }>;
};

function bindingStatusLabel(binding?: Binding | null, manufacturerCode?: string | null) {
  return integrationBindingLabel({
    manufacturerCode,
    status: binding?.status,
    lastErrorMessage: binding?.lastErrorMessage,
    hasBinding: Boolean(binding),
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

export default function InversorDetalhePage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<Inverter | null>(null);
  const [monitoring, setMonitoring] = useState<InverterMonitoring | null>(null);
  const [diagnosis, setDiagnosis] = useState<OperationalDiagnosisResponse | null>(null);
  const [error, setError] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(() => {
    return Promise.all([
      fetchApi<Inverter>(`/inverters/${params.id}`).then(setData),
      fetchApi<InverterMonitoring>(`/monitoring/inverters/${params.id}/history?period=last7days`)
        .then(setMonitoring)
        .catch(() => undefined),
      fetchApi<OperationalDiagnosisResponse>(`/monitoring/diagnostics/inverters/${params.id}`)
        .then(setDiagnosis)
        .catch(() => undefined),
    ]).catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o inversor.'));
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function testConnection() {
    setTesting(true);
    setTestMessage('Testando conexão...');
    try {
      const result = await fetchApi<{ ok: boolean; message: string }>('/integrations/auxsol/test', { method: 'POST' });
      setTestMessage(result.ok ? 'Conexão realizada com sucesso.' : result.message || 'Não foi possível conectar.');
      await load();
    } catch (err) {
      setTestMessage(err instanceof ApiError ? err.message : 'Não foi possível conectar.');
    } finally {
      setTesting(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setSyncMessage('Sincronizando...');
    try {
      const result = await fetchApi<{ ok: boolean; message: string }>(`/integrations/collect/${params.id}`, { method: 'POST' });
      setSyncMessage(result.ok ? 'Sincronização concluída.' : result.message || 'Não foi possível sincronizar.');
      await load();
    } catch (err) {
      setSyncMessage(err instanceof ApiError ? err.message : 'Não foi possível sincronizar.');
    } finally {
      setSyncing(false);
    }
  }

  if (error) return <div className="shell"><ErrorMessage message={error} /></div>;
  if (!data) return <div className="shell"><LoadingState message="Carregando inversor..." /></div>;

  const binding = data.bindings?.find((item) => item.provider === data.manufacturerRef?.code) ?? data.bindings?.[0];
  const isAuxsol = data.manufacturerRef?.code === 'AUXSOL';
  const canOperate = can(user, 'SETTINGS_VIEW') && isAuxsol;

  return (
    <div className="shell">
      <PageHeader
        title={data.model || 'Inversor'}
        description="Cadastro operacional e estado do vínculo de monitoramento."
        actions={<StatusBadge label={recordStatusLabel(data.status)} status={data.status} />}
      />
      <section className="cards">
        <article className="card"><span>Usina</span><strong><Link href={`/usinas/${data.plant?.id}`}>{data.plant?.name || '—'}</Link></strong></article>
        <article className="card"><span>Cliente</span><strong>{data.plant?.customer ? <Link href={`/clientes/${data.plant.customer.id}`}>{data.plant.customer.name}</Link> : '—'}</strong></article>
        <article className="card"><span>Fabricante</span><strong>{data.manufacturerRef?.name || '—'}</strong></article>
        <article className="card"><span>Modelo</span><strong>{data.model || '—'}</strong></article>
        <article className="card"><span>Número de série</span><strong>{data.serialNumber || '—'}</strong></article>
        <article className="card"><span>Potência</span><strong>{formatPower(data.ratedPowerKw)}</strong></article>
        <article className="card"><span>Identificador externo (legado)</span><strong>{data.externalId || '—'}</strong></article>
        <article className="card"><span>Última leitura</span><strong>{monitoring?.latestReading ? formatDateTime(monitoring.latestReading.collectedAt) : (monitoring?.emptyReadingMessage || 'Sem dados de monitoramento.')}</strong></article>
        <article className="card"><span>Potência atual</span><strong>{monitoring?.latestReading ? formatPower(monitoring.latestReading.powerKw) : '—'}</strong></article>
        <article className="card"><span>Geração no período</span><strong>{formatEnergyKwh(monitoring?.history.energyKwh ?? null, Boolean(monitoring?.history.hasData))}</strong></article>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-title">
          <div>
            <h2>Gateway / Datalogger associados</h2>
            <p>Equipamentos auxiliares vinculados a este inversor. O serial do gateway não é o serial do inversor.</p>
          </div>
          <Link href={`/equipamentos?usina=${data.plant?.id || ''}`}><Button variant="secondary">Ver equipamentos</Button></Link>
        </div>
        <DataTable
          rows={data.equipment ?? []}
          rowKey={(row) => row.id}
          columns={[
            { key: 'type', header: 'Tipo', render: (row) => row.type },
            { key: 'serial', header: 'Número de série', render: (row) => row.serialNumber },
            { key: 'manufacturer', header: 'Fabricante', render: (row) => row.manufacturerName || '—' },
            { key: 'model', header: 'Modelo', render: (row) => row.model || '—' },
          ]}
          empty={<EmptyState title="Nenhum gateway/datalogger associado" description="Cadastre o equipamento e associe-o a este inversor." />}
        />
      </section>

      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Monitoramento</h2>
            <p>Estado do vínculo com o Motor de Integrações. Dados fictícios não são exibidos como reais.</p>
          </div>
          {canOperate ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => void testConnection()} disabled={testing || syncing}>
                {testing ? 'Testando conexão...' : 'Testar conexão'}
              </Button>
              <Button type="button" onClick={() => void syncNow()} disabled={testing || syncing}>
                {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
              </Button>
            </div>
          ) : null}
        </div>
        <section className="cards" style={{ marginTop: 20 }}>
          <article className="card"><span>Fabricante</span><strong>{data.manufacturerRef?.name || '—'}</strong></article>
          <article className="card"><span>Status da integração</span><strong>{bindingStatusLabel(binding, data.manufacturerRef?.code)}</strong></article>
          <article className="card"><span>Identificador externo</span><strong>{binding?.externalId || data.externalId || '—'}</strong></article>
          <article className="card"><span>Última sincronização</span><strong>{binding?.lastSyncAt ? `Sincronizado em ${formatDateTime(binding.lastSyncAt)}` : 'Nunca sincronizado'}</strong></article>
          <article className="card"><span>Último erro</span><strong>{binding?.lastErrorMessage || '—'}</strong></article>
          <article className="card"><span>Estado da conexão</span><strong>{bindingStatusLabel(binding, data.manufacturerRef?.code)}</strong></article>
        </section>
        {testMessage ? <p>{testMessage}</p> : null}
        {syncMessage ? <p>{syncMessage}</p> : null}
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-title">
          <div>
            <h2>Diagnóstico Operacional</h2>
            <p>Problema detectado com base nas evidências disponíveis, sem afirmar causa confirmada.</p>
          </div>
          {diagnosis?.diagnosis ? <StatusBadge label={getAlertSeverityLabel(diagnosis.diagnosis.severity)} status={diagnosis.diagnosis.severity} /> : null}
        </div>
        {diagnosis?.diagnosis ? (
          <div className="cards" style={{ marginTop: 20 }}>
            <article className="card"><span>Diagnóstico</span><strong>{diagnosis.diagnosis.title}</strong></article>
            <article className="card"><span>Status</span><strong>{diagnosis.diagnosis.status}</strong></article>
            <article className="card"><span>Observado desde</span><strong>{diagnosis.diagnosis.since ? formatDateTime(diagnosis.diagnosis.since) : '—'}</strong></article>
            <article className="card"><span>Status normalizado</span><strong>{diagnosis.diagnosis.evidence.normalizedStatus || '—'}</strong></article>
            <article className="card"><span>Disponibilidade</span><strong>{formatPercentOrNd(diagnosis.diagnosis.evidence.availability)}</strong></article>
            <article className="card"><span>Cobertura</span><strong>{formatCoveragePercent(diagnosis.diagnosis.evidence.coverage)}</strong></article>
            <article className="card"><span>Ação recomendada</span><strong>{diagnosis.diagnosis.recommendedAction}</strong></article>
            {diagnosis.diagnosis.evidence.equipmentCode || diagnosis.diagnosis.evidence.equipmentMessage ? (
              <article className="card"><span>Informação do equipamento</span><strong>{[diagnosis.diagnosis.evidence.equipmentCode, diagnosis.diagnosis.evidence.equipmentMessage].filter(Boolean).join(' · ')}</strong></article>
            ) : null}
          </div>
        ) : (
          <EmptyState title="Nenhum incidente operacional ativo." description="Não existem dados suficientes para diagnóstico." />
        )}
        <div className="panel-title" style={{ marginTop: 24 }}><h3>Timeline operacional</h3></div>
        {diagnosis?.timeline.length ? (
          <ul className="alert-list">
            {diagnosis.timeline.map((event, index) => <li key={`${event.type}-${event.at}-${index}`}><div><strong>{event.label}</strong><p>{event.status || event.type}</p></div><div className="alert-meta"><span>{formatDateTime(event.at)}</span></div></li>)}
          </ul>
        ) : <p>Não existem eventos suficientes para diagnóstico.</p>}
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-title">
          <div>
            <h2>Disponibilidade</h2>
            <p>
              {monitoring?.availability?.availabilityPercent == null
                ? 'Não há dados suficientes para calcular a disponibilidade.'
                : `Período: ${periodLabel(monitoring.availability.period)}.`}
            </p>
          </div>
        </div>
        <section className="cards" style={{ marginTop: 20 }}>
          <article className="card">
            <span>Saúde</span>
            <strong>
              <StatusBadge
                label={healthLabel(monitoring?.availability?.health, monitoring?.availability?.reason)}
                status={monitoring?.availability?.health || 'NO_DATA'}
              />
            </strong>
          </article>
          <article className="card"><span>Status observado</span><strong>{monitoring?.availability?.lastObservedStatus || 'Sem dados'}</strong></article>
          <article className="card"><span>Disponibilidade</span><strong>{formatPercentOrNd(monitoring?.availability?.availabilityPercent)}</strong></article>
          <article className="card"><span>Cobertura</span><strong>{formatCoveragePercent(monitoring?.availability?.coveragePercent ?? 0)}</strong></article>
          {monitoring?.availability && monitoring.availability.observedSeconds > 0 ? (
            <>
              <article className="card"><span>Tempo online</span><strong>{formatObservedDuration(monitoring.availability.onlineSeconds)}</strong></article>
              <article className="card"><span>Tempo warning</span><strong>{formatObservedDuration(monitoring.availability.warningSeconds)}</strong></article>
              <article className="card"><span>Tempo offline</span><strong>{formatObservedDuration(monitoring.availability.offlineSeconds)}</strong></article>
              <article className="card"><span>Tempo error</span><strong>{formatObservedDuration(monitoring.availability.errorSeconds)}</strong></article>
            </>
          ) : null}
          <article className="card"><span>Última leitura</span><strong>{monitoring?.latestReading ? formatDateTime(monitoring.latestReading.collectedAt) : '—'}</strong></article>
        </section>
      </section>
      <MonitoringHistoryPanel
        endpoint={`/monitoring/inverters/${data.id}/history`}
        lockPlant
        lockInverter
        plantId={data.plant?.id}
        inverterId={data.id}
      />
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-title">
          <div>
            <h2>Alertas do inversor</h2>
            <p>Eventos do Motor de Alertas vinculados a este equipamento.</p>
          </div>
        </div>
        <DataTable
          rows={monitoring?.alerts ?? []}
          rowKey={(row) => row.id}
          columns={[
            { key: 'title', header: 'Alerta', render: (row) => row.title },
            { key: 'severity', header: 'Severidade', render: (row) => getAlertSeverityLabel(row.severity) },
            { key: 'status', header: 'Estado', render: (row) => getAlertStatusLabel(row.status) },
            { key: 'when', header: 'Horário', render: (row) => formatDateTime(row.occurredAt) },
          ]}
          empty={<EmptyState title="Nenhum alerta" description="Os alertas deste inversor aparecerão aqui." />}
        />
      </section>
    </div>
  );
}
