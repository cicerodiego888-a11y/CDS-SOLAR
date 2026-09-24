'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../../../components/auth/AuthProvider';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorMessage } from '../../../components/ui/ErrorMessage';
import { LoadingState } from '../../../components/ui/LoadingState';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SelectField } from '../../../components/ui/SelectField';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TextField } from '../../../components/ui/TextField';
import { ApiError, fetchApi } from '../../../lib/api';
import {
  buildConsumerUnitPayload,
  normalizeUtilityInput,
  validateConsumerUnitForm,
} from '../../../lib/consumer-units';
import {
  buildEnergyPayload,
  concealDocument,
  EnergyDocumentType,
  hasEnergyErrors,
  maskDocumentInput,
  validateEnergyForm,
  EnergyFieldErrors,
} from '../../../lib/energy-document';
import { can, DOCUMENT_TYPE_OPTIONS, plantOperationalLabel, recordStatusLabel } from '../../../lib/operational';

type Customer = {
  id: string;
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  plants: Array<{ id: string; name: string; status: string; _count?: { inverters: number; equipment: number } }>;
};

type EnergyConsumer = {
  id: string;
  name: string;
  document: string;
  documentType: EnergyDocumentType;
  email?: string | null;
  phone?: string | null;
};

type EnergyForm = {
  documentType: EnergyDocumentType;
  document: string;
  name: string;
  email: string;
  phone: string;
};

type ConsumerUnitRow = {
  id: string;
  number: string;
  contractAccount?: string | null;
  status: string;
  distributorId: string;
  distributor?: { id: string; name: string; code: string } | null;
};

type DistributorOption = { id: string; name: string; code: string; status: string };

type UnitForm = {
  distributorId: string;
  number: string;
  contractAccount: string;
};

const emptyEnergyForm: EnergyForm = { documentType: 'CPF', document: '', name: '', email: '', phone: '' };
const emptyUnitForm: UnitForm = { distributorId: '', number: '', contractAccount: '' };

export default function ClienteDetalhePage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<Customer | null>(null);
  const [error, setError] = useState('');
  const [consumer, setConsumer] = useState<EnergyConsumer | null | undefined>(undefined);
  const [consumerError, setConsumerError] = useState('');
  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [form, setForm] = useState<EnergyForm>(emptyEnergyForm);
  const [fieldErrors, setFieldErrors] = useState<EnergyFieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [units, setUnits] = useState<ConsumerUnitRow[] | null>(null);
  const [unitsError, setUnitsError] = useState('');
  const [distributors, setDistributors] = useState<DistributorOption[]>([]);
  const [unitMode, setUnitMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [editingUnit, setEditingUnit] = useState<ConsumerUnitRow | null>(null);
  const [unitForm, setUnitForm] = useState<UnitForm>(emptyUnitForm);
  const [unitFieldErrors, setUnitFieldErrors] = useState<ReturnType<typeof validateConsumerUnitForm>>({});
  const [unitFormError, setUnitFormError] = useState('');
  const [unitSaving, setUnitSaving] = useState(false);
  const canUpdate = can(user, 'CUSTOMERS_UPDATE');

  async function loadUnits() {
    try {
      setUnitsError('');
      setUnits(await fetchApi<ConsumerUnitRow[]>(`/customers/${params.id}/consumer-units`));
    } catch (err) {
      setUnits([]);
      setUnitsError(err instanceof ApiError ? err.message : 'Não foi possível carregar as unidades consumidoras.');
    }
  }

  useEffect(() => {
    let active = true;
    setData(null);
    setConsumer(undefined);
    setUnits(null);
    setError('');
    setConsumerError('');
    setUnitsError('');
    setMode('idle');
    setUnitMode('idle');
    fetchApi<Customer>(`/customers/${params.id}`)
      .then((customer) => { if (active) setData(customer); })
      .catch((err) => { if (active) setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o cliente.'); });
    fetchApi<{ consumer: EnergyConsumer | null }>(`/customers/${params.id}/consumer`)
      .then((body) => { if (active) setConsumer(body.consumer); })
      .catch((err) => {
        if (!active) return;
        setConsumer(null);
        if (!(err instanceof ApiError && err.status === 404)) {
          setConsumerError(err instanceof ApiError ? err.message : 'Não foi possível carregar o cadastro energético.');
        }
      });
    fetchApi<ConsumerUnitRow[]>(`/customers/${params.id}/consumer-units`)
      .then((rows) => { if (active) setUnits(rows); })
      .catch((err) => {
        if (!active) return;
        setUnits([]);
        setUnitsError(err instanceof ApiError ? err.message : 'Não foi possível carregar as unidades consumidoras.');
      });
    fetchApi<DistributorOption[]>('/distributors')
      .then((rows) => { if (active) setDistributors(rows.filter((row) => row.status === 'ACTIVE')); })
      .catch(() => { if (active) setDistributors([]); });
    return () => { active = false; };
  }, [params.id]);

  function openCreate() {
    setFormError('');
    setFieldErrors({});
    setForm(emptyEnergyForm);
    setMode('create');
  }

  function openEdit() {
    if (!consumer) return;
    setFormError('');
    setFieldErrors({});
    setForm({
      documentType: consumer.documentType === 'CNPJ' ? 'CNPJ' : 'CPF',
      document: maskDocumentInput(consumer.document, consumer.documentType === 'CNPJ' ? 'CNPJ' : 'CPF'),
      name: consumer.name,
      email: consumer.email || '',
      phone: consumer.phone || '',
    });
    setMode('edit');
  }

  async function saveEnergy(event: FormEvent) {
    event.preventDefault();
    const errors = validateEnergyForm(form);
    setFieldErrors(errors);
    if (hasEnergyErrors(errors)) return;
    setSaving(true);
    setFormError('');
    try {
      const payload = buildEnergyPayload(form);
      const saved = await fetchApi<EnergyConsumer>(`/customers/${params.id}/consumer`, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setConsumer(saved);
      setMode('idle');
      await loadUnits();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o cadastro energético.');
    } finally {
      setSaving(false);
    }
  }

  function openUnitCreate() {
    setUnitFormError('');
    setUnitFieldErrors({});
    setEditingUnit(null);
    setUnitForm(emptyUnitForm);
    setUnitMode('create');
  }

  function openUnitEdit(unit: ConsumerUnitRow) {
    setUnitFormError('');
    setUnitFieldErrors({});
    setEditingUnit(unit);
    setUnitForm({
      distributorId: unit.distributorId,
      number: unit.number,
      contractAccount: unit.contractAccount || '',
    });
    setUnitMode('edit');
  }

  async function saveUnit(event: FormEvent) {
    event.preventDefault();
    const errors = validateConsumerUnitForm(unitForm);
    setUnitFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    setUnitSaving(true);
    setUnitFormError('');
    try {
      const payload = buildConsumerUnitPayload(unitForm);
      if (unitMode === 'edit' && editingUnit) {
        await fetchApi(`/consumer-units/${editingUnit.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            distributorId: payload.distributorId,
            number: payload.number,
            contractAccount: payload.contractAccount ?? null,
          }),
        });
      } else {
        await fetchApi(`/customers/${params.id}/consumer-units`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setUnitMode('idle');
      setEditingUnit(null);
      await loadUnits();
    } catch (err) {
      setUnitFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar a unidade consumidora.');
    } finally {
      setUnitSaving(false);
    }
  }

  if (error) return <div className="shell"><ErrorMessage message={error} /></div>;
  if (!data) return <div className="shell"><LoadingState message="Carregando cliente..." /></div>;

  const distributorOptions = distributors.map((row) => ({ value: row.id, label: `${row.name} (${row.code})` }));

  return (
    <div className="shell">
      <PageHeader
        title={data.name}
        description={`${data.document || 'Documento não informado'} · ${data.email || 'sem e-mail'}`}
        actions={<StatusBadge label={recordStatusLabel(data.status)} status={data.status} />}
      />
      <section className="panel panel-compact">
        <div className="panel-title">
          <div>
            <h2>DADOS ENERGÉTICOS</h2>
            <p>Cadastro do consumidor no domínio energético.</p>
          </div>
          {consumer !== undefined && mode === 'idle' && canUpdate ? (
            consumer
              ? <Button variant="secondary" type="button" onClick={openEdit}>Editar cadastro energético</Button>
              : <Button type="button" onClick={openCreate}>Cadastrar consumidor energético</Button>
          ) : null}
        </div>
        {consumerError ? <ErrorMessage message={consumerError} /> : null}
        {consumer === undefined ? <p>Carregando cadastro energético...</p> : null}
        {consumer !== undefined && mode === 'idle' ? (
          <div className="energy-summary">
            <p>
              Status:{' '}
              {consumer
                ? <StatusBadge label="Cadastrado" status="ACTIVE" />
                : <StatusBadge label="Não cadastrado" status="INACTIVE" />}
            </p>
            {consumer ? <p>Documento: {concealDocument(consumer.document)}</p> : null}
          </div>
        ) : null}
        {mode !== 'idle' ? (
          <form className="energy-form" onSubmit={(event) => void saveEnergy(event)}>
            {formError ? <p className="ui-modal-error" role="alert">{formError}</p> : null}
            <SelectField
              id="energy-doc-type"
              label="Tipo de documento"
              value={form.documentType}
              options={DOCUMENT_TYPE_OPTIONS}
              error={fieldErrors.documentType}
              onChange={(documentType) => {
                const nextType: EnergyDocumentType = documentType === 'CNPJ' ? 'CNPJ' : 'CPF';
                setForm({ ...form, documentType: nextType, document: maskDocumentInput(form.document, nextType) });
              }}
            />
            <TextField
              id="energy-document"
              label="Documento"
              value={form.document}
              error={fieldErrors.document}
              onChange={(document) => setForm({ ...form, document: maskDocumentInput(document, form.documentType) })}
            />
            <TextField id="energy-name" label="Nome do titular" value={form.name} error={fieldErrors.name} onChange={(name) => setForm({ ...form, name })} />
            <TextField id="energy-email" label="E-mail" type="email" value={form.email} error={fieldErrors.email} onChange={(email) => setForm({ ...form, email })} />
            <TextField id="energy-phone" label="Telefone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
            <div className="actions-cell">
              <Button variant="secondary" type="button" onClick={() => { setMode('idle'); setFormError(''); setFieldErrors({}); }}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </form>
        ) : null}

        {consumer ? (
          <div className="energy-units">
            <div className="panel-title">
              <div>
                <h3>UNIDADES CONSUMIDORAS</h3>
                <p>UC e Conta Contrato são campos distintos.</p>
              </div>
              {unitMode === 'idle' && canUpdate ? (
                <Button type="button" onClick={openUnitCreate}>+ Cadastrar unidade consumidora</Button>
              ) : null}
            </div>
            {unitsError ? <ErrorMessage message={unitsError} /> : null}
            {units === null ? <p>Carregando unidades consumidoras...</p> : null}
            {units && units.length === 0 && unitMode === 'idle' ? (
              <p>Este consumidor ainda não possui unidade consumidora cadastrada.</p>
            ) : null}
            {units && units.length > 0 && unitMode === 'idle' ? (
              <div className="energy-unit-grid">
                {units.map((unit) => (
                  <article key={unit.id} className="energy-unit-card">
                    <dl className="detail-grid">
                      <div>
                        <dt>Unidade consumidora</dt>
                        <dd>{unit.number}</dd>
                      </div>
                      <div>
                        <dt>Conta contrato</dt>
                        <dd>{unit.contractAccount || 'Não informada'}</dd>
                      </div>
                      <div>
                        <dt>Distribuidora</dt>
                        <dd>{unit.distributor?.name || '—'}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd><StatusBadge label={recordStatusLabel(unit.status)} status={unit.status} /></dd>
                      </div>
                    </dl>
                    {canUpdate ? <Button variant="secondary" type="button" onClick={() => openUnitEdit(unit)}>Editar</Button> : null}
                  </article>
                ))}
              </div>
            ) : null}
            {unitMode !== 'idle' ? (
              <form className="energy-form" onSubmit={(event) => void saveUnit(event)}>
                {unitFormError ? <p className="ui-modal-error" role="alert">{unitFormError}</p> : null}
                <SelectField
                  id="unit-distributor"
                  label="Distribuidora"
                  value={unitForm.distributorId}
                  options={distributorOptions}
                  error={unitFieldErrors.distributorId}
                  onChange={(distributorId) => setUnitForm({ ...unitForm, distributorId })}
                />
                <TextField
                  id="unit-number"
                  label="Unidade consumidora"
                  value={unitForm.number}
                  error={unitFieldErrors.number}
                  onChange={(number) => setUnitForm({ ...unitForm, number: normalizeUtilityInput(number) })}
                />
                <TextField
                  id="unit-contract"
                  label="Conta contrato"
                  value={unitForm.contractAccount}
                  error={unitFieldErrors.contractAccount}
                  onChange={(contractAccount) => setUnitForm({ ...unitForm, contractAccount: normalizeUtilityInput(contractAccount) })}
                />
                <div className="actions-cell">
                  <Button variant="secondary" type="button" onClick={() => { setUnitMode('idle'); setEditingUnit(null); setUnitFormError(''); setUnitFieldErrors({}); }}>Cancelar</Button>
                  <Button type="submit" disabled={unitSaving}>{unitSaving ? 'Salvando...' : 'Salvar'}</Button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-title">
          <div>
            <h2>Usinas do cliente</h2>
            <p>{data.plants.length} usina(s) vinculada(s).</p>
          </div>
          <Link href={`/usinas?cliente=${data.id}`}><Button>Ver usinas</Button></Link>
        </div>
        <DataTable
          rows={data.plants}
          rowKey={(row) => row.id}
          columns={[
            { key: 'name', header: 'Usina', render: (row) => <Link href={`/usinas/${row.id}`}>{row.name}</Link> },
            { key: 'inverters', header: 'Inversores', render: (row) => row._count?.inverters ?? 0 },
            { key: 'equipment', header: 'Equipamentos', render: (row) => row._count?.equipment ?? 0 },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge label={plantOperationalLabel(row.status)} status={row.status} /> },
          ]}
          empty={<EmptyState title="Nenhuma usina" description="Este cliente ainda não possui usinas." />}
        />
      </section>
    </div>
  );
}
