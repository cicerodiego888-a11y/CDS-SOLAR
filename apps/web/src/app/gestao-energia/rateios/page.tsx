'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/auth/AuthProvider';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorMessage } from '../../../components/ui/ErrorMessage';
import { LoadingState } from '../../../components/ui/LoadingState';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { DataTable } from '../../../components/ui/DataTable';
import { SelectField } from '../../../components/ui/SelectField';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TextField } from '../../../components/ui/TextField';
import { ApiError, fetchApi } from '../../../lib/api';
import { can } from '../../../lib/operational';

type PlantOption = { id: string; name: string };
type ConsumerUnitOption = {
  id: string;
  number: string;
  consumerId: string;
  consumer?: { id: string; name: string };
};

type RateioLine = {
  id: string;
  consumerUnitId: string;
  consumerUnitNumber: string;
  consumerId: string;
  consumerName: string;
  percentage: string;
  consumption: null;
  compensated: null;
  credit: null;
  balance: null;
};

type RateioVersion = {
  id: string;
  label: string;
  versionNumber: number;
  validFrom: string;
  validTo: string | null;
  derivedStatus: string;
  totalPercentage: string;
  totalIs100: boolean;
  lines: RateioLine[];
  notes: string[];
};

type DraftLine = { consumerUnitId: string; consumerId: string; consumerName: string; percentage: string };

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export default function RateiosPage() {
  const router = useRouter();
  const { user } = useAuth();
  const canUpdate = can(user, 'ENERGY_UPDATE');
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [units, setUnits] = useState<ConsumerUnitOption[]>([]);
  const [plantId, setPlantId] = useState('');
  const [versions, setVersions] = useState<RateioVersion[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { consumerUnitId: '', consumerId: '', consumerName: '', percentage: '' },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user && !can(user, 'ENERGY_VIEW')) router.replace('/acesso-negado');
  }, [user, router]);

  useEffect(() => {
    Promise.all([
      fetchApi<PlantOption[]>('/plants'),
      fetchApi<ConsumerUnitOption[]>('/consumer-units'),
    ])
      .then(([plantList, unitList]) => {
        setPlants(plantList);
        setUnits(unitList);
        if (plantList[0]) setPlantId((current) => current || plantList[0].id);
      })
      .catch((err: Error) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        setError(err.message);
      });
  }, []);

  const loadRateios = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchApi<{ versions: RateioVersion[] }>(`/energy/plants/${id}/rateios`);
      setVersions(data.versions);
      setSelectedId((current) => {
        if (current && data.versions.some((item) => item.id === current)) return current;
        return data.versions[0]?.id ?? '';
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar rateios';
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      setError(message);
      setVersions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!plantId || !can(user, 'ENERGY_VIEW')) return;
    void loadRateios(plantId);
  }, [plantId, user]);

  const selected = versions.find((item) => item.id === selectedId) ?? null;

  const draftTotal = useMemo(() => {
    const sum = draftLines.reduce((acc, line) => acc + (Number(String(line.percentage).replace(',', '.')) || 0), 0);
    return Number(sum.toFixed(4));
  }, [draftLines]);

  const updateDraftLine = (index: number, patch: Partial<DraftLine>) => {
    setDraftLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const onSelectUnit = (index: number, consumerUnitId: string) => {
    const unit = units.find((item) => item.id === consumerUnitId);
    updateDraftLine(index, {
      consumerUnitId,
      consumerId: unit?.consumerId || unit?.consumer?.id || '',
      consumerName: unit?.consumer?.name || '',
    });
  };

  const submitVersion = async () => {
    if (!plantId || !canUpdate) return;
    setSaving(true);
    setError('');
    try {
      const body = {
        validFrom: new Date(validFrom).toISOString(),
        validTo: validTo ? new Date(validTo).toISOString() : null,
        lines: draftLines.map((line) => ({
          consumerUnitId: line.consumerUnitId,
          consumerId: line.consumerId,
          percentage: line.percentage,
        })),
      };
      if (selected && showForm) {
        await fetchApi(`/energy/plants/${plantId}/rateios/${selected.id}/new-version`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      } else {
        await fetchApi(`/energy/plants/${plantId}/rateios`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setShowForm(false);
      await loadRateios(plantId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar Rateio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="shell rateio-page">
      <PageHeader
        eyebrow="Energia"
        title="Alocação / Rateio"
        description="Regra versionada de distribuição percentual da usina para UCs. Não calcula kWh, compensação, crédito ou saldo."
        actions={(
          <Link href="/gestao-energia" className="ui-button ui-button-secondary rateio-header-link">
            Voltar à Gestão de Energia
          </Link>
        )}
      />

      {forbidden ? <ErrorMessage message="Sem permissão para Gestão de Energia." /> : null}
      {error && !forbidden ? <ErrorMessage message={error} /> : null}

      <section className="rateio-panel">
        <div className="rateio-toolbar">
          <div className="rateio-filters">
            <label className="ui-field" htmlFor="rateio-plant">
              <span className="ui-field-label">Usina</span>
              <select id="rateio-plant" name="rateio-plant" value={plantId} onChange={(event) => setPlantId(event.target.value)}>
                {plants.map((plant) => (
                  <option key={plant.id} value={plant.id}>{plant.name}</option>
                ))}
              </select>
            </label>
            <label className="ui-field" htmlFor="rateio-version">
              <span className="ui-field-label">Versão</span>
              <select id="rateio-version" name="rateio-version" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={!versions.length}>
                {!versions.length ? <option value="">Sem rateio</option> : null}
                {versions.map((item) => (
                  <option key={item.id} value={item.id}>{item.label} · {item.derivedStatus}</option>
                ))}
              </select>
            </label>
          </div>
          {canUpdate ? (
            <Button
              type="button"
              onClick={() => {
                setShowForm(true);
                setValidFrom('');
                setValidTo('');
                setDraftLines([{ consumerUnitId: '', consumerId: '', consumerName: '', percentage: '' }]);
              }}
            >
              {versions.length ? 'Nova versão' : 'Criar Rateio'}
            </Button>
          ) : null}
        </div>
      </section>

      {loading ? <LoadingState message="Carregando Rateio..." /> : null}

      {!loading && !selected && !showForm ? (
        <EmptyState title="Nenhum Rateio configurado" description="Crie a primeira versão de alocação para esta usina. José/Ulisses não recebem rateio automático." />
      ) : null}

      {!loading && selected ? (
        <section className="rateio-panel rateio-selected" aria-labelledby="rateio-selected-title">
          <div className="rateio-selected-header">
            <div>
              <p className="rateio-group-label">Versão selecionada</p>
              <h2 id="rateio-selected-title">{selected.label}</h2>
            </div>
            <StatusBadge label={selected.derivedStatus} status={selected.derivedStatus} />
          </div>
          <dl className="detail-grid rateio-summary">
            <div><dt>Início da vigência</dt><dd>{formatDate(selected.validFrom)}</dd></div>
            <div><dt>Fim da vigência</dt><dd>{selected.validTo ? formatDate(selected.validTo) : 'aberta'}</dd></div>
            <div><dt>Total do Rateio</dt><dd className="rateio-total">{selected.totalPercentage}%</dd></div>
          </dl>

          <h3 className="rateio-subtitle">Participantes</h3>
          <div className="ui-table-wrap rateio-table-wrap">
            <table className="ui-table rateio-table">
              <thead>
                <tr>
                  <th>UC</th>
                  <th>Consumidor</th>
                  <th className="rateio-num">Rateio</th>
                  <th>Vigência</th>
                  <th>Status</th>
                  <th className="rateio-unavailable" title="Disponível após implantação do motor de consumo/compensação.">Consumo</th>
                  <th className="rateio-unavailable" title="Disponível após implantação do motor de consumo/compensação.">Compensado</th>
                  <th className="rateio-unavailable" title="Disponível após implantação do motor de consumo/compensação.">Crédito</th>
                  <th className="rateio-unavailable" title="Disponível após implantação do motor de consumo/compensação.">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((row) => (
                  <tr key={row.id}>
                    <td className="rateio-uc">{row.consumerUnitNumber}</td>
                    <td>{row.consumerName}</td>
                    <td className="rateio-num rateio-percentage">{row.percentage}%</td>
                    <td className="rateio-nowrap">{formatDate(selected.validFrom)} → {selected.validTo ? formatDate(selected.validTo) : '—'}</td>
                    <td><StatusBadge label={selected.derivedStatus} status={selected.derivedStatus} /></td>
                    <td className="rateio-unavailable">—</td>
                    <td className="rateio-unavailable">—</td>
                    <td className="rateio-unavailable">—</td>
                    <td className="rateio-unavailable">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rateio-muted">Consumo, Compensado, Crédito e Saldo: disponível após implantação do motor de consumo/compensação.</p>

          {selected.notes.length ? (
            <ul className="rateio-notes">
              {selected.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          ) : null}
        </section>
      ) : null}

      {!loading && versions.length > 1 ? (
        <section className="rateio-panel">
          <SectionHeader title="Histórico do Rateio" description="Versões anteriores permanecem imutáveis." />
          <DataTable
            rows={versions}
            rowKey={(item) => item.id}
            columns={[
              {
                key: 'label',
                header: 'Versão',
                render: (item) => (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setSelectedId(item.id)}
                    aria-pressed={item.id === selectedId}
                  >
                    {item.label}
                  </Button>
                ),
              },
              { key: 'validity', header: 'Vigência', render: (item) => <span className="rateio-nowrap">{formatDate(item.validFrom)} → {item.validTo ? formatDate(item.validTo) : 'aberta'}</span> },
              { key: 'status', header: 'Status', render: (item) => <StatusBadge label={item.derivedStatus} status={item.derivedStatus} /> },
              { key: 'percentages', header: 'Rateio', render: (item) => <span className="rateio-percentage">{item.lines.map((line) => `${line.percentage}%`).join(' / ')}</span> },
            ]}
          />
        </section>
      ) : null}

      {showForm && canUpdate ? (
        <section className="rateio-panel rateio-form">
          <SectionHeader
            title={versions.length ? 'Nova versão de Rateio' : 'Criar Rateio'}
            description="Validação de 100% e sobreposição ocorre no backend."
          />
          <p className="rateio-group-label">Vigência</p>
          <div className="rateio-form-grid">
            <TextField id="rateio-valid-from" label="Início da vigência" type="datetime-local" value={validFrom} onChange={setValidFrom} />
            <TextField id="rateio-valid-to" label="Fim da vigência (opcional)" type="datetime-local" value={validTo} onChange={setValidTo} />
          </div>

          <p className="rateio-group-label rateio-lines-label">Participantes</p>
          <div className="rateio-lines">
            {draftLines.map((line, index) => (
              <div key={`draft-${index}`} className="rateio-line">
                <SelectField
                  id={`rateio-uc-${index}`}
                  label="UC"
                  value={line.consumerUnitId}
                  options={units.map((unit) => ({ value: unit.id, label: unit.number }))}
                  onChange={(value) => onSelectUnit(index, value)}
                />
                <label className="ui-field" htmlFor={`rateio-consumer-${index}`}>
                  <span className="ui-field-label">Consumidor</span>
                  <input id={`rateio-consumer-${index}`} value={line.consumerName || '—'} readOnly />
                </label>
                <TextField
                  id={`rateio-pct-${index}`}
                  label="%"
                  value={line.percentage}
                  onChange={(value) => updateDraftLine(index, { percentage: value })}
                />
              </div>
            ))}
          </div>

          <div className="rateio-form-footer">
            <Button type="button" variant="secondary" onClick={() => setDraftLines((rows) => [...rows, { consumerUnitId: '', consumerId: '', consumerName: '', percentage: '' }])}>
              Adicionar UC
            </Button>
            <strong className="rateio-total-pill">TOTAL: {draftTotal}%</strong>
            {Math.abs(draftTotal - 100) > 0.0001 ? <span className="rateio-warning" role="status">O rateio deve totalizar 100%.</span> : null}
            <div className="rateio-form-actions">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="button" onClick={() => void submitVersion()} disabled={saving || !validFrom || Math.abs(draftTotal - 100) > 0.0001}>
                {saving ? 'Salvando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
