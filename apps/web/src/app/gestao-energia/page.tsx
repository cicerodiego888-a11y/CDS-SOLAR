'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { LoadingState } from '../../components/ui/LoadingState';
import { MetricCard } from '../../components/ui/MetricCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { DataTable } from '../../components/ui/DataTable';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../components/auth/AuthProvider';
import { ApiError, fetchApi } from '../../lib/api';
import { formatDateTime, formatEnergyKwh } from '../../lib/format';
import { can } from '../../lib/operational';

type PlantOption = { id: string; name: string };

type EnergySummary = {
  domain: 'ENERGY_MANAGEMENT';
  plantId: string;
  plantName: string;
  period: { key: string; from: string; to: string; granularity: string };
  timezone: string;
  hasData: boolean;
  generation: { value: number; unit: 'kWh'; source: string } | null;
  emptyMessage: string | null;
  hasIntegrationBinding: boolean;
  notes: string[];
};

type UcConsumptionItem = {
  consumerUnitId: string;
  consumerUnitNumber: string;
  contractAccount: string | null;
  consumer: { id: string; name: string };
  distributor: { id: string; name: string; code: string };
  hasData: boolean;
  consumption: { value: number; unit: 'kWh'; origin: string } | null;
  availability: 'AVAILABLE' | 'UNAVAILABLE';
  emptyMessage: string | null;
};

type PlantUcConsumption = {
  plantId: string;
  plantName: string;
  hasAnyConsumptionData: boolean;
  consumerUnits: UcConsumptionItem[];
  notes: string[];
  period: { key: string; from: string; to: string };
  timezone: string;
};

type AllocationRow = {
  consumerUnitId: string;
  consumerUnitNumber: string;
  consumerName: string;
  percentage: string;
  allocatedKwh: string;
};

type AllocationSegment = {
  from: string;
  to: string;
  rateioLabel: string;
  hasData: boolean;
  generationKwh: string | null;
};

type AllocationResult = {
  hasData: boolean;
  generationKwh: string | null;
  allocatedTotalKwh: string | null;
  allocations: AllocationRow[];
  segments: AllocationSegment[];
  emptyMessage: string | null;
};

const PERIODS = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last7days', label: 'Últimos 7 dias' },
  { value: 'thisMonth', label: 'Mês atual' },
  { value: 'custom', label: 'Período customizado' },
] as const;

export default function GestaoEnergiaPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [plantId, setPlantId] = useState('');
  const [period, setPeriod] = useState<string>('thisMonth');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [ucId, setUcId] = useState('');
  const [summary, setSummary] = useState<EnergySummary | null>(null);
  const [ucBundle, setUcBundle] = useState<PlantUcConsumption | null>(null);
  const [allocation, setAllocation] = useState<AllocationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (user && !can(user, 'ENERGY_VIEW')) {
      router.replace('/acesso-negado');
    }
  }, [user, router]);

  useEffect(() => {
    fetchApi<PlantOption[]>('/plants')
      .then((list) => {
        setPlants(list);
        if (list[0]) setPlantId((current) => current || list[0].id);
      })
      .catch((err: Error) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        setError(err.message);
      });
  }, []);

  const query = useMemo(() => {
    const params = new URLSearchParams({ period });
    if (period === 'custom') {
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
    }
    return params.toString();
  }, [period, startDate, endDate]);

  useEffect(() => {
    if (!plantId || !can(user, 'ENERGY_VIEW')) return;
    if (period === 'custom' && (!startDate || !endDate)) {
      setSummary(null);
      setUcBundle(null);
      setAllocation(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setForbidden(false);
    Promise.all([
      fetchApi<EnergySummary>(`/energy/plants/${plantId}/summary?${query}`),
      fetchApi<PlantUcConsumption>(`/energy/plants/${plantId}/consumer-units/consumption?${query}`),
      fetchApi<AllocationResult>(`/energy/plants/${plantId}/allocations?${query}`),
    ])
      .then(([generation, consumption, allocationData]) => {
        if (cancelled) return;
        setSummary(generation);
        setUcBundle(consumption);
        setAllocation(allocationData);
        setUcId((current) => {
          if (current && consumption.consumerUnits.some((item) => item.consumerUnitId === current)) {
            return current;
          }
          return consumption.consumerUnits[0]?.consumerUnitId ?? '';
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setSummary(null);
        setUcBundle(null);
        setAllocation(null);
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(true);
          setError(err.message);
          return;
        }
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plantId, query, period, startDate, endDate, user]);

  const selectedUc = ucBundle?.consumerUnits.find((item) => item.consumerUnitId === ucId) ?? null;

  const generationDisplay = formatEnergyKwh(
    summary?.generation?.value ?? null,
    Boolean(summary?.hasData && summary.generation),
  );
  const consumptionDisplay = formatEnergyKwh(
    selectedUc?.consumption?.value ?? null,
    Boolean(selectedUc?.hasData && selectedUc.consumption),
  );

  return (
    <div className="shell energy-page">
      <PageHeader
        eyebrow="Energia"
        title="Gestão de Energia"
        description="Geração da usina, consumo das UCs e Rateio versionado — distintos. Sem créditos, compensação ou faturamento neste estágio."
        actions={(
          <Link href="/gestao-energia/rateios" className="ui-button ui-button-secondary energy-header-link">
            Abrir Rateio / Alocação
          </Link>
        )}
      />

      {forbidden ? (
        <ErrorMessage message="Você não possui permissão para acessar a Gestão de Energia." />
      ) : null}
      {error && !forbidden ? <ErrorMessage message={error} /> : null}

      <section className="energy-panel">
        <SectionHeader
          title="Consulta energética"
          description="Geração (MonitoringReading) e consumo (ConsumerUnit) — fontes e significados diferentes."
        />
        <div className="energy-filters">
          <label className="ui-field" htmlFor="energy-plant">
            <span className="ui-field-label">Usina</span>
            <select id="energy-plant" name="energy-plant" value={plantId} onChange={(event) => setPlantId(event.target.value)} disabled={!plants.length}>
              {!plants.length ? <option value="">Nenhuma usina</option> : null}
              {plants.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="ui-field" htmlFor="energy-period">
            <span className="ui-field-label">Período</span>
            <select id="energy-period" name="energy-period" value={period} onChange={(event) => setPeriod(event.target.value)}>
              {PERIODS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          {period === 'custom' ? (
            <>
              <TextField id="energy-start" label="De" type="date" value={startDate} onChange={setStartDate} />
              <TextField id="energy-end" label="Até" type="date" value={endDate} onChange={setEndDate} />
            </>
          ) : null}
        </div>
      </section>

      {loading ? <LoadingState message="Carregando gestão de energia..." /> : null}

      {!loading && !error && !summary && plantId && period === 'custom' && (!startDate || !endDate) ? (
        <EmptyState title="Informe o período" description="Selecione data inicial e final para a consulta customizada." />
      ) : null}

      {!loading && summary ? (
        <>
          <section className="energy-overview" aria-label="Visão energética">
            <h2 className="energy-group-label">Visão energética</h2>
            <div className="cards energy-cards">
              <MetricCard
                title="Geração da Usina"
                value={generationDisplay}
                note={summary.hasData ? `Fonte telemetria: ${summary.generation?.source ?? '—'}` : 'Sem leituras de geração no período'}
                accent="green"
              />
              <MetricCard
                title="Consumo das UCs"
                value={consumptionDisplay}
                note={
                  selectedUc
                    ? (selectedUc.hasData
                      ? `Origem: ${selectedUc.consumption?.origin ?? '—'}`
                      : 'CONSUMO REAL: NÃO DISPONÍVEL')
                    : (ucBundle?.consumerUnits.length ? 'Selecione uma UC' : 'Nenhuma UC vinculada à usina')
                }
                accent="amber"
              />
              <MetricCard
                title="Timezone"
                value={summary.timezone}
                note={`${formatDateTime(summary.period.from)} → ${formatDateTime(summary.period.to)}`}
              />
            </div>
          </section>

          {!summary.hasData ? (
            <section className="energy-panel">
              <EmptyState
                title="Sem dados de geração"
                description={summary.emptyMessage || 'Não há MonitoringReading no período. Isso não significa 0 kWh.'}
              />
            </section>
          ) : null}

          <section className="energy-panel">
            <SectionHeader
              title="Consumo das UCs"
              description="Consumo pertence à Unidade Consumidora — não é derivado da geração da usina."
            />

            {!ucBundle?.consumerUnits.length ? (
              <EmptyState
                title="Nenhuma UC vinculada"
                description="Vincule uma Unidade Consumidora à usina no cadastro para consultar consumo."
              />
            ) : (
              <>
                <label className="ui-field energy-uc-select" htmlFor="energy-uc">
                  <span className="ui-field-label">Unidade consumidora</span>
                  <select id="energy-uc" name="energy-uc" value={ucId} onChange={(event) => setUcId(event.target.value)}>
                    {ucBundle.consumerUnits.map((item) => (
                      <option key={item.consumerUnitId} value={item.consumerUnitId}>
                        {item.consumerUnitNumber}
                        {item.distributor?.name ? ` — ${item.distributor.name}` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedUc && !selectedUc.hasData ? (
                  <EmptyState
                    title="Sem dados de consumo para o período."
                    description={selectedUc.emptyMessage || 'Ausência de consumo não significa 0 kWh.'}
                  />
                ) : null}

                {selectedUc?.hasData ? (
                  <dl className="detail-grid energy-data-grid">
                    <div><dt>Consumo no período</dt><dd className="energy-value">{formatEnergyKwh(selectedUc.consumption!.value, true)}</dd></div>
                    <div><dt>UC</dt><dd>{selectedUc.consumerUnitNumber}</dd></div>
                    <div><dt>Consumidor</dt><dd>{selectedUc.consumer.name}</dd></div>
                    <div><dt>Origem</dt><dd>{selectedUc.consumption?.origin}</dd></div>
                  </dl>
                ) : null}

                {ucBundle.notes?.length ? (
                  <ul className="energy-notes">
                    {ucBundle.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </section>

          <section className="energy-panel">
            <SectionHeader
              title="Alocação de Energia"
              description="Geração real × Rateio versionado = kWh alocado por UC. Sem compensação, crédito ou saldo."
              actions={(
                <strong className="energy-total">
                  Total:{' '}
                  {allocation?.hasData
                    ? formatEnergyKwh(Number(allocation.allocatedTotalKwh), true)
                    : '—'}
                </strong>
              )}
            />

            {!allocation?.hasData ? (
              <EmptyState
                title="Sem alocação disponível"
                description={allocation?.emptyMessage || 'Sem geração disponível para o período.'}
              />
            ) : (
              <>
                <dl className="detail-grid energy-data-grid">
                  <div>
                    <dt>Geração da usina</dt>
                    <dd className="energy-value">{formatEnergyKwh(Number(allocation.generationKwh), true)}</dd>
                  </div>
                </dl>
                {allocation.segments.length > 1 ? (
                  <div className="energy-segments">
                    <h3 className="energy-subtitle">Vigências de rateio no período</h3>
                    <ul className="energy-notes">
                      {allocation.segments.map((segment) => (
                        <li key={`${segment.rateioLabel}-${segment.from}`}>
                          {formatDateTime(segment.from)} → {formatDateTime(segment.to)} · {segment.rateioLabel}
                          {segment.hasData ? ` · ${formatEnergyKwh(Number(segment.generationKwh), true)}` : ' · —'}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <DataTable
                  rows={allocation.allocations}
                  rowKey={(row) => row.consumerUnitId}
                  columns={[
                    { key: 'uc', header: 'UC', render: (row) => <span className="energy-uc-number">{row.consumerUnitNumber}</span> },
                    { key: 'consumer', header: 'Consumidor', render: (row) => row.consumerName },
                    { key: 'percentage', header: 'Rateio', render: (row) => (row.percentage === 'MIXED' ? 'misto' : `${row.percentage}%`) },
                    { key: 'allocated', header: 'Alocado', render: (row) => <span className="energy-value">{formatEnergyKwh(Number(row.allocatedKwh), true)}</span> },
                  ]}
                  empty={<EmptyState title="Nenhuma UC na alocação" description="O rateio vigente não retornou unidades consumidoras para o período." />}
                />
              </>
            )}
          </section>

          <section className="energy-panel">
            <SectionHeader title={summary.plantName} description={`Domínio ${summary.domain} · período ${summary.period.key}`} />
            <ul className="energy-notes">
              {summary.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
