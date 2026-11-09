'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../components/auth/AuthProvider';
import { Button } from '../../../components/ui/Button';
import { ErrorMessage } from '../../../components/ui/ErrorMessage';
import { LoadingState } from '../../../components/ui/LoadingState';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ApiError, fetchApi } from '../../../lib/api';
import { MonitoringHistoryPanel } from '../../../components/monitoring/MonitoringHistoryPanel';
import { getAlertSeverityLabel, getAlertStatusLabel } from '../../../constants/inverters';
import { healthLabel, periodLabel } from '../../../lib/availability';
import {
  diagnosisStatusLabel,
  diagnosisTimelineStatusLabel,
  equipmentStatusLabel,
  observedStatusLabel,
  normalizedStatusLabel,
} from '../../../lib/status-labels';
import {
  COLLECTION_IN_PROGRESS_MESSAGE,
  collectInverterLive,
  type CollectInverterResult,
  type LiveReadingPayload,
} from '../../../lib/collect-inverter';
import { formatCoveragePercent, formatEnergyKwh, formatObservedDuration, formatPercentOrNd, formatPowerKw } from '../../../lib/format';
import { can, equipmentTypeLabel, formatPower, recordStatusLabel } from '../../../lib/operational';
import { resolveOperationalIntegrationState } from '../../../lib/integration-status';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState } from '../../../components/ui/EmptyState';
import { TextField } from '../../../components/ui/TextField';

type Binding = {
  provider: string;
  externalId?: string | null;
  status?: string | null;
  lastSyncAt?: string | null;
  lastErrorAt?: string | null;
  lastErrorMessage?: string | null;
};

type LiveReading = LiveReadingPayload & {
  status?: string | null;
  equipmentStatus?: string | null;
};

type CollectResponse = CollectInverterResult & {
  message?: string;
  persisted?: number;
  mode?: string;
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
  const [lookupKey, setLookupKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [validation, setValidation] = useState<{
    found: boolean;
    code: string;
    message: string;
    identity?: {
      externalId: string;
      serialNumber?: string | null;
      model?: string | null;
      plantId?: string | number | null;
      inverterId?: string | number | null;
    } | null;
    technical?: Record<string, unknown>;
  } | null>(null);
  const [bindMessage, setBindMessage] = useState('');
  const [liveReading, setLiveReading] = useState<LiveReading | null>(null);
  const [liveError, setLiveError] = useState('');
  const liveBootstrappedFor = useRef<string | null>(null);

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

  /**
   * Coleta via Promise compartilhada (collect-inverter.ts).
   * Não contorna o dedupe; 409 = coleta em andamento; preserva última leitura válida.
   */
  const refreshLiveReading = useCallback(async () => {
    setLiveError('');
    const outcome = await collectInverterLive(params.id);
    if (outcome.status === 'concurrent') {
      setLiveError(COLLECTION_IN_PROGRESS_MESSAGE);
      return {
        ok: false,
        message: COLLECTION_IN_PROGRESS_MESSAGE,
        liveReading: null,
        concurrent: true,
      } as CollectResponse & { concurrent: true };
    }
    if (outcome.status === 'error') {
      // Não apaga a última leitura válida; não trata 409 aqui (já mapeado acima).
      setLiveError(outcome.message || 'Não foi possível obter a leitura ao vivo.');
      return {
        ok: false,
        message: outcome.message,
        liveReading: null,
      } as CollectResponse;
    }
    const result = outcome.result;
    if (result.liveReading?.available) {
      setLiveReading(result.liveReading as LiveReading);
      setLiveError('');
    } else {
      setLiveReading(result.liveReading as LiveReading | null);
      setLiveError(result.liveReading?.unavailableReason || result.message || 'Leitura ao vivo indisponível.');
    }
    return result as CollectResponse;
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data?.bindings?.length) return;
    const binding = data.bindings.find((item) => item.provider === data.manufacturerRef?.code) ?? data.bindings[0];
    if (!binding?.externalId) return;
    // Evita segundo disparo por remount Strict Mode / recriação de data no mesmo id.
    if (liveBootstrappedFor.current === data.id) return;
    liveBootstrappedFor.current = data.id;
    void refreshLiveReading();
  }, [data, refreshLiveReading]);

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
    if (syncing) return;
    setSyncing(true);
    setSyncMessage('Sincronizando...');
    try {
      const result = await refreshLiveReading();
      if ('concurrent' in result && result.concurrent) {
        setSyncMessage(COLLECTION_IN_PROGRESS_MESSAGE);
        return;
      }
      setSyncMessage(result.ok
        ? (result.liveReading?.available
          ? (result.persisted ? 'Sincronização concluída.' : 'Leitura ao vivo atualizada (sem persistência).')
          : (result.liveReading?.unavailableReason || result.message || 'Coleta sem dados.'))
        : (result.message || 'Não foi possível sincronizar.'));
      if (result.ok) await load();
    } catch (err) {
      setSyncMessage(err instanceof ApiError ? err.message : 'Não foi possível sincronizar.');
    } finally {
      setSyncing(false);
    }
  }

  async function validateIdentity() {
    setValidating(true);
    setBindMessage('');
    setValidation(null);
    try {
      const result = await fetchApi<{
        found: boolean;
        code: string;
        message: string;
        identity?: {
          externalId: string;
          serialNumber?: string | null;
          model?: string | null;
          plantId?: string | number | null;
          inverterId?: string | number | null;
        } | null;
        technical?: Record<string, unknown>;
      }>(`/inverters/${params.id}/integration-binding/validate`, {
        method: 'POST',
        body: JSON.stringify({ lookupKey: lookupKey || data?.serialNumber || '' }),
      });
      setValidation(result);
      if (!result.found) setBindMessage(result.message);
    } catch (err) {
      setBindMessage(err instanceof ApiError ? err.message : 'Não foi possível validar a identidade.');
    } finally {
      setValidating(false);
    }
  }

  async function confirmBinding() {
    setLinking(true);
    setBindMessage('');
    try {
      await fetchApi(`/inverters/${params.id}/integration-binding`, {
        method: 'POST',
        body: JSON.stringify({ lookupKey: lookupKey || data?.serialNumber || '' }),
      });
      setBindMessage('Integração configurada.');
      setValidation(null);
      await load();
    } catch (err) {
      setBindMessage(err instanceof ApiError ? err.message : 'Não foi possível confirmar o vínculo.');
    } finally {
      setLinking(false);
    }
  }

  async function removeBinding() {
    setUnlinking(true);
    setBindMessage('');
    try {
      await fetchApi(`/inverters/${params.id}/integration-binding`, { method: 'DELETE' });
      setBindMessage('Vínculo removido.');
      setValidation(null);
      await load();
    } catch (err) {
      setBindMessage(err instanceof ApiError ? err.message : 'Não foi possível remover o vínculo.');
    } finally {
      setUnlinking(false);
    }
  }

  if (error) {
    return (
      <div className="shell inverters-detail">
        <ErrorMessage message={error} />
        <Link href="/inversores"><Button type="button" variant="secondary">Voltar para inversores</Button></Link>
      </div>
    );
  }
  if (!data) return <div className="shell inverters-detail"><LoadingState message="Carregando inversor..." /></div>;

  const binding = data.bindings?.find((item) => item.provider === data.manufacturerRef?.code) ?? data.bindings?.[0];
  const isAuxsol = data.manufacturerRef?.code === 'AUXSOL';
  const canOperate = can(user, 'SETTINGS_VIEW') && isAuxsol;
  const canBind = (can(user, 'SETTINGS_VIEW') || can(user, 'INVERTERS_UPDATE')) && Boolean(data.manufacturerRef?.code);
  const latestCollectedAt = liveReading?.available
    ? liveReading.collectedAt
    : monitoring?.latestReading?.collectedAt ?? null;
  const latestCommunicationOk = liveReading?.available
    ? liveReading.communicationOk
    : monitoring?.latestReading?.communicationOk;
  const operationalState = resolveOperationalIntegrationState({
    hasBinding: Boolean(binding),
    bindingStatus: binding?.status,
    externalId: binding?.externalId,
    lastReadingAt: latestCollectedAt,
    communicationOk: latestCommunicationOk,
    lastErrorMessage: binding?.lastErrorMessage || liveError || null,
  });
  const headerDescription = [data.manufacturerRef?.name, data.serialNumber ? `Série ${data.serialNumber}` : null]
    .filter(Boolean)
    .join(' · ') || 'Cadastro operacional e estado do vínculo de monitoramento.';
  const communicationLabel = liveError === COLLECTION_IN_PROGRESS_MESSAGE
    ? 'Coleta em andamento'
    : liveError
      ? 'Falha de comunicação'
      : liveReading?.available
        ? (liveReading.communicationOk === false ? 'Sem comunicação' : 'Comunicação OK')
        : (monitoring?.latestReading
          ? (monitoring.latestReading.communicationOk ? 'Comunicação OK' : 'Sem comunicação')
          : 'Indisponível');

  return (
    <div className="shell inverters-detail">
      <PageHeader
        eyebrow="Inversor"
        title={data.model || 'Inversor'}
        description={headerDescription}
        actions={(
          <div className="inverters-detail-actions">
            <StatusBadge label={recordStatusLabel(data.status)} status={data.status} />
            <Link href="/inversores"><Button type="button" variant="ghost">Voltar</Button></Link>
          </div>
        )}
      />

      <section className="inverters-panel">
        <SectionHeader title="Dados técnicos" description="Cadastro operacional do inversor e vínculos com usina e cliente." />
        <dl className="detail-grid inverters-data-grid">
          <div><dt>Fabricante</dt><dd>{data.manufacturerRef?.name || '—'}</dd></div>
          <div><dt>Modelo</dt><dd>{data.model || '—'}</dd></div>
          <div><dt>Número de série</dt><dd>{data.serialNumber ? <code className="inverters-serial">{data.serialNumber}</code> : '—'}</dd></div>
          <div><dt>Potência</dt><dd>{formatPower(data.ratedPowerKw)}</dd></div>
          <div>
            <dt>Usina</dt>
            <dd>{data.plant ? <Link className="inverters-name-link" href={`/usinas/${data.plant.id}`}>{data.plant.name}</Link> : '—'}</dd>
          </div>
          <div>
            <dt>Cliente</dt>
            <dd>{data.plant?.customer ? <Link className="inverters-name-link" href={`/clientes/${data.plant.customer.id}`}>{data.plant.customer.name}</Link> : '—'}</dd>
          </div>
          <div>
            <dt>Identificador externo (legado)</dt>
            <dd>{data.externalId ? <code className="inverters-serial">{data.externalId}</code> : '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="inverters-panel">
        <SectionHeader
          title="Monitoramento ao vivo"
          description="Consulta realtime via IntegrationEngine. Sem dado não é zero. Persistência controlada pela configuração do backend."
        />
        <div className="cards inverters-kpi-cards">
          <article className="card"><span>Status de comunicação</span><strong>{communicationLabel}</strong></article>
          <article className="card"><span>Potência instantânea</span><strong>{formatPowerKw(liveReading?.powerKw ?? null, Boolean(liveReading?.available && liveReading.powerKw !== null))}</strong></article>
          <article className="card"><span>Geração do dia</span><strong>{formatEnergyKwh(liveReading?.energyTodayKwh ?? null, Boolean(liveReading?.available && liveReading.energyTodayKwh !== null))}</strong></article>
          <article className="card"><span>Geração do mês</span><strong>{formatEnergyKwh(liveReading?.energyMonthKwh ?? null, Boolean(liveReading?.available && liveReading.energyMonthKwh !== null))}</strong></article>
          <article className="card"><span>Geração acumulada</span><strong>{formatEnergyKwh(liveReading?.energyTotalKwh ?? null, Boolean(liveReading?.available && liveReading.energyTotalKwh !== null))}</strong></article>
          <article className="card"><span>Última atualização</span><strong>{liveReading?.available && liveReading.collectedAt ? formatDateTime(liveReading.collectedAt) : 'Indisponível'}</strong></article>
          <article className="card"><span>Última comunicação</span><strong>{liveReading?.lastCommAt ? formatDateTime(liveReading.lastCommAt) : 'Indisponível'}</strong></article>
          <article className="card"><span>Estado do equipamento</span><strong>{equipmentStatusLabel(liveReading?.status, liveReading?.equipmentStatus)}</strong></article>
          <article className="card"><span>Alarmes</span><strong>{liveReading?.alarms?.summary || 'Indisponível'}</strong></article>
        </div>
        {liveError ? <ErrorMessage message={liveError} /> : null}
        {liveReading && !liveReading.available && !liveError ? (
          <EmptyState title="Leitura ao vivo indisponível" description={liveReading.unavailableReason || 'O fabricante não retornou telemetria.'} />
        ) : null}
      </section>

      <section className="inverters-panel">
        <SectionHeader title="Leitura recente" description="Histórico persistido no monitoramento local (pode estar vazio com persistência desligada)." />
        <div className="cards inverters-kpi-cards">
          <article className="card"><span>Última leitura persistida</span><strong>{monitoring?.latestReading ? formatDateTime(monitoring.latestReading.collectedAt) : (monitoring?.emptyReadingMessage || 'Sem dados de monitoramento.')}</strong></article>
          <article className="card"><span>Potência persistida</span><strong>{monitoring?.latestReading ? formatPower(monitoring.latestReading.powerKw) : '—'}</strong></article>
          <article className="card"><span>Geração no período</span><strong>{formatEnergyKwh(monitoring?.history.energyKwh ?? null, Boolean(monitoring?.history.hasData))}</strong></article>
        </div>
      </section>

      <section className="inverters-panel">
        <SectionHeader
          title="Gateway / Datalogger associados"
          description="Equipamentos auxiliares vinculados a este inversor. O serial do gateway não é o serial do inversor."
          actions={<Link href={`/equipamentos?usina=${data.plant?.id || ''}`}><Button type="button" variant="secondary">Ver equipamentos</Button></Link>}
        />
        <DataTable
          rows={data.equipment ?? []}
          rowKey={(row) => row.id}
          columns={[
            { key: 'type', header: 'Tipo', render: (row) => equipmentTypeLabel(row.type) },
            { key: 'serial', header: 'Número de série', render: (row) => <code className="inverters-serial">{row.serialNumber}</code> },
            { key: 'manufacturer', header: 'Fabricante', render: (row) => row.manufacturerName || '—' },
            { key: 'model', header: 'Modelo', render: (row) => row.model || '—' },
          ]}
          empty={<EmptyState title="Nenhum gateway/datalogger associado" description="Cadastre o equipamento e associe-o a este inversor." />}
        />
      </section>

      <section className="inverters-panel">
        <SectionHeader
          title="Integração"
          description="Vínculo oficial com o fabricante. Serial local não é external ID."
          actions={canOperate ? (
            <div className="inverters-detail-actions">
              <Button type="button" variant="secondary" onClick={() => void testConnection()} disabled={testing || syncing}>
                {testing ? 'Testando conexão...' : 'Testar conexão'}
              </Button>
              <Button type="button" onClick={() => void syncNow()} disabled={testing || syncing || !binding?.externalId}>
                {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
              </Button>
            </div>
          ) : null}
        />
        <div className="inverters-integration-status">
          <StatusBadge label={operationalState.label} status={operationalState.state} />
        </div>
        <dl className="detail-grid inverters-data-grid">
          <div><dt>Fabricante</dt><dd>{data.manufacturerRef?.name || '—'}</dd></div>
          <div><dt>Modelo</dt><dd>{data.model || '—'}</dd></div>
          <div><dt>Serial</dt><dd>{data.serialNumber ? <code className="inverters-serial">{data.serialNumber}</code> : '—'}</dd></div>
          <div><dt>External ID</dt><dd>{binding?.externalId ? <code className="inverters-serial">{binding.externalId}</code> : '—'}</dd></div>
          <div><dt>Binding</dt><dd>{binding?.externalId ? 'Configurado' : 'Não configurado'}</dd></div>
          <div><dt>Status</dt><dd>{operationalState.label}</dd></div>
          <div><dt>Última coleta</dt><dd>{binding?.lastSyncAt ? formatDateTime(binding.lastSyncAt) : '—'}</dd></div>
          <div><dt>Última leitura</dt><dd>{latestCollectedAt ? formatDateTime(latestCollectedAt) : 'Sem dados de monitoramento'}</dd></div>
          <div><dt>Último erro</dt><dd className={(binding?.lastErrorMessage || liveError) ? 'inverters-error-text' : undefined}>{binding?.lastErrorMessage || liveError || '—'}</dd></div>
        </dl>
        {canBind ? (
          <div className="inverters-binding-form">
            <TextField
              id="lookup-key"
              label="Identidade externa (SN ou ID oficial do fabricante)"
              value={lookupKey}
              onChange={setLookupKey}
              placeholder={data.serialNumber || 'Informe a identidade a validar'}
            />
            <div className="inverters-detail-actions">
              <Button type="button" variant="secondary" onClick={() => void validateIdentity()} disabled={validating || linking}>
                {validating ? 'Validando...' : 'Validar identidade'}
              </Button>
              {validation?.found ? (
                <Button type="button" onClick={() => void confirmBinding()} disabled={linking}>
                  {linking ? 'Vinculando...' : 'Confirmar vínculo'}
                </Button>
              ) : null}
              {binding ? (
                <Button type="button" variant="ghost" onClick={() => void removeBinding()} disabled={unlinking}>
                  {unlinking ? 'Removendo...' : 'Remover vínculo'}
                </Button>
              ) : null}
            </div>
            {validation?.found ? (
              <div className="inverters-validation inverters-validation-found" role="status">
                <p className="inverters-validation-title">Identidade encontrada</p>
                <dl className="inverters-validation-list">
                  <div><dt>Fabricante</dt><dd>{data.manufacturerRef?.name || '—'}</dd></div>
                  <div><dt>Modelo</dt><dd>{validation.identity?.model || '—'}</dd></div>
                  <div><dt>Serial</dt><dd>{validation.identity?.serialNumber || '—'}</dd></div>
                  <div><dt>External ID</dt><dd>{validation.identity?.externalId || '—'}</dd></div>
                  {validation.identity?.plantId != null ? <div><dt>Plant ID</dt><dd>{String(validation.identity.plantId)}</dd></div> : null}
                  {validation.identity?.inverterId != null ? <div><dt>Inverter ID</dt><dd>{String(validation.identity.inverterId)}</dd></div> : null}
                </dl>
              </div>
            ) : null}
            {validation && !validation.found ? (
              <div className="inverters-validation inverters-validation-missing" role="status">
                <p className="inverters-validation-title">Identidade não encontrada</p>
                <p>{validation.message}</p>
                {validation.technical ? (
                  <details>
                    <summary>Detalhes técnicos</summary>
                    <pre className="inverters-technical">{JSON.stringify(validation.technical, null, 2)}</pre>
                  </details>
                ) : null}
              </div>
            ) : null}
            {bindMessage ? <p className="inverters-feedback" aria-live="polite">{bindMessage}</p> : null}
          </div>
        ) : null}
        {testMessage ? <p className="inverters-feedback" aria-live="polite">{testMessage}</p> : null}
        {syncMessage ? <p className="inverters-feedback" aria-live="polite">{syncMessage}</p> : null}
      </section>

      <section className="inverters-panel">
        <SectionHeader
          title="Diagnóstico Operacional"
          description="Problema detectado com base nas evidências disponíveis, sem afirmar causa confirmada."
          actions={diagnosis?.diagnosis ? <StatusBadge label={getAlertSeverityLabel(diagnosis.diagnosis.severity)} status={diagnosis.diagnosis.severity} /> : null}
        />
        {diagnosis?.diagnosis ? (
          <div className="cards inverters-kpi-cards">
            <article className="card"><span>Diagnóstico</span><strong>{diagnosis.diagnosis.title}</strong></article>
            <article className="card"><span>Status</span><strong>{diagnosisStatusLabel(diagnosis.diagnosis.status)}</strong></article>
            <article className="card"><span>Observado desde</span><strong>{diagnosis.diagnosis.since ? formatDateTime(diagnosis.diagnosis.since) : '—'}</strong></article>
            <article className="card"><span>Status normalizado</span><strong>{normalizedStatusLabel(diagnosis.diagnosis.evidence.normalizedStatus)}</strong></article>
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
        <h3 className="inverters-subtitle">Timeline operacional</h3>
        {diagnosis?.timeline.length ? (
          <ul className="alert-list">
            {diagnosis.timeline.map((event, index) => <li key={`${event.type}-${event.at}-${index}`}><div><strong>{event.label}</strong><p>{diagnosisTimelineStatusLabel(event.status, event.type)}</p></div><div className="alert-meta"><span>{formatDateTime(event.at)}</span></div></li>)}
          </ul>
        ) : <p className="inverters-muted">Não existem eventos suficientes para diagnóstico.</p>}
      </section>

      <section className="inverters-panel">
        <SectionHeader
          title="Disponibilidade"
          description={monitoring?.availability?.availabilityPercent == null
            ? 'Não há dados suficientes para calcular a disponibilidade.'
            : `Período: ${periodLabel(monitoring.availability.period)}.`}
        />
        <div className="cards inverters-kpi-cards">
          <article className="card">
            <span>Saúde</span>
            <strong>
              <StatusBadge
                label={healthLabel(monitoring?.availability?.health, monitoring?.availability?.reason)}
                status={monitoring?.availability?.health || 'NO_DATA'}
              />
            </strong>
          </article>
          <article className="card"><span>Status observado</span><strong>{observedStatusLabel(monitoring?.availability?.lastObservedStatus)}</strong></article>
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
        </div>
      </section>

      <MonitoringHistoryPanel
        endpoint={`/monitoring/inverters/${data.id}/history`}
        lockPlant
        lockInverter
        plantId={data.plant?.id}
        inverterId={data.id}
      />

      <section className="inverters-panel">
        <SectionHeader title="Alertas do inversor" description="Eventos do Motor de Alertas vinculados a este equipamento." />
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
