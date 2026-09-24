'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '../../components/auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { LoadingState } from '../../components/ui/LoadingState';
import { Modal } from '../../components/ui/Modal';
import { useDraftModal } from '../../components/ui/useDraftModal';
import { PageHeader } from '../../components/ui/PageHeader';
import { SelectField } from '../../components/ui/SelectField';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { TextField } from '../../components/ui/TextField';
import { ApiError, fetchApi } from '../../lib/api';
import { can, formatPower, parsePowerKw, RECORD_STATUS_OPTIONS, recordStatusLabel } from '../../lib/operational';

type Manufacturer = { id: string; name: string; code: string };
type Plant = { id: string; name: string };
type Inverter = {
  id: string;
  model?: string | null;
  serialNumber?: string | null;
  ratedPowerKw?: string | number | null;
  externalId?: string | null;
  status?: string | null;
  plantId: string;
  manufacturerId?: string | null;
  manufacturerRef?: { name: string } | null;
  plant?: { name: string; customer?: { name: string } };
};

const emptyForm = { plantId: '', manufacturerId: '', model: '', serialNumber: '', ratedPowerKw: '', externalId: '', status: 'ACTIVE' };

function InversoresContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Inverter[] | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ plantId: searchParams.get('usina') || '', manufacturerId: '', status: '', search: '' });
  const { open, editing, form, setForm, openCreate: startCreate, openEdit: startEdit, close, clearAfterSave } = useDraftModal<typeof emptyForm, Inverter>(emptyForm);
  const [formError, setFormError] = useState('');

  async function load() {
    try {
      setError('');
      const query = new URLSearchParams();
      if (filters.plantId) query.set('plantId', filters.plantId);
      if (filters.manufacturerId) query.set('manufacturerId', filters.manufacturerId);
      if (filters.status) query.set('status', filters.status);
      if (filters.search) query.set('search', filters.search);
      const [inverters, plantRows, manufacturerRows] = await Promise.all([
        fetchApi<Inverter[]>(`/inverters${query.toString() ? `?${query}` : ''}`),
        fetchApi<Plant[]>('/plants'),
        fetchApi<Manufacturer[]>('/manufacturers'),
      ]);
      setRows(inverters);
      setPlants(plantRows);
      setManufacturers(manufacturerRows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os inversores.');
    }
  }

  useEffect(() => { void load(); }, [filters.plantId, filters.manufacturerId, filters.status, filters.search]);

  function openCreate() {
    setFormError('');
    startCreate({ plantId: filters.plantId });
  }

  function openEdit(row: Inverter) {
    setFormError('');
    startEdit(row, (item) => ({
      plantId: item.plantId,
      manufacturerId: item.manufacturerId || '',
      model: item.model || '',
      serialNumber: item.serialNumber || '',
      ratedPowerKw: String(item.ratedPowerKw ?? ''),
      externalId: item.externalId || '',
      status: item.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    }));
  }

  async function save() {
    const ratedPowerKw = parsePowerKw(form.ratedPowerKw);
    if (!form.plantId) {
      setFormError('Selecione a usina.');
      return;
    }
    if (!form.manufacturerId) {
      setFormError('Selecione o fabricante.');
      return;
    }
    if (!form.model.trim()) {
      setFormError('Informe o modelo.');
      return;
    }
    if (!form.serialNumber.trim()) {
      setFormError('Informe o número de série.');
      return;
    }
    if (ratedPowerKw === undefined) {
      setFormError('Informe a potência nominal em kW. Use ponto ou vírgula, por exemplo 10,5.');
      return;
    }
    const payload = {
      plantId: form.plantId,
      manufacturerId: form.manufacturerId,
      model: form.model.trim(),
      serialNumber: form.serialNumber.trim(),
      ratedPowerKw,
      externalId: form.externalId.trim(),
      ...(editing ? {} : { status: form.status }),
    };
    try {
      setFormError('');
      if (editing) await fetchApi(`/inverters/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await fetchApi('/inverters', { method: 'POST', body: JSON.stringify(payload) });
      clearAfterSave();
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível salvar o inversor.';
      setFormError(message);
    }
  }

  async function toggleStatus(row: Inverter) {
    const status = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await fetchApi(`/inverters/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  }

  return (
    <div className="shell">
      <PageHeader title="Inversores" description="Cadastro operacional vinculado ao catálogo oficial de fabricantes." />
      {error ? <ErrorMessage message={error} /> : null}
      {!rows && !error ? <LoadingState message="Carregando inversores..." /> : null}
      {rows ? (
        <section className="panel">
          <div className="toolbar">
            <div className="toolbar-filters">
              <SelectField id="filtro-usina" label="Usina" value={filters.plantId} options={plants.map((item) => ({ value: item.id, label: item.name }))} placeholder="Todas" onChange={(plantId) => setFilters({ ...filters, plantId })} />
              <SelectField id="filtro-fab" label="Fabricante" value={filters.manufacturerId} options={manufacturers.map((item) => ({ value: item.id, label: item.name }))} placeholder="Todos" onChange={(manufacturerId) => setFilters({ ...filters, manufacturerId })} />
              <SelectField id="filtro-status" label="Status" value={filters.status} options={RECORD_STATUS_OPTIONS} placeholder="Todos" onChange={(status) => setFilters({ ...filters, status })} />
              <TextField id="busca-inv" label="Buscar" value={filters.search} onChange={(search) => setFilters({ ...filters, search })} placeholder="Modelo ou série" />
            </div>
            {can(user, 'INVERTERS_CREATE') ? <Button onClick={openCreate}>Novo inversor</Button> : null}
          </div>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              { key: 'name', header: 'Inversor', render: (row) => <Link href={`/inversores/${row.id}`}>{row.model || 'Inversor'}</Link> },
              { key: 'plant', header: 'Usina', render: (row) => row.plant?.name || '—' },
              { key: 'manufacturer', header: 'Fabricante', render: (row) => row.manufacturerRef?.name || '—' },
              { key: 'model', header: 'Modelo', render: (row) => row.model || '—' },
              { key: 'serial', header: 'Número de série', render: (row) => row.serialNumber || '—' },
              { key: 'power', header: 'Potência', render: (row) => formatPower(row.ratedPowerKw) },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge label={recordStatusLabel(row.status)} status={row.status} /> },
              {
                key: 'actions',
                header: 'Ações',
                render: (row) => (
                  <div className="actions-cell">
                    {can(user, 'INVERTERS_UPDATE') ? <Button variant="secondary" onClick={() => openEdit(row)}>Editar</Button> : null}
                    {can(user, 'INVERTERS_UPDATE') ? <Button variant="ghost" onClick={() => void toggleStatus(row)}>{row.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}</Button> : null}
                  </div>
                ),
              },
            ]}
            empty={<EmptyState title="Nenhum registro encontrado" description="Cadastre um inversor vinculado a uma usina e a um fabricante oficial." />}
          />
        </section>
      ) : null}
      <Modal open={open} title={editing ? 'Editar inversor' : 'Novo inversor'} error={formError} onClose={close} onConfirm={() => void save()}>
        <div className="form-grid">
          <SelectField id="usina-inv" label="Usina" value={form.plantId} options={plants.map((item) => ({ value: item.id, label: item.name }))} placeholder="Selecione a usina" onChange={(plantId) => setForm({ ...form, plantId })} />
          <SelectField id="fab-inv" label="Fabricante" value={form.manufacturerId} options={manufacturers.map((item) => ({ value: item.id, label: item.name }))} placeholder="Selecione o fabricante" onChange={(manufacturerId) => setForm({ ...form, manufacturerId })} />
          <TextField id="modelo-inv" label="Modelo" value={form.model} onChange={(model) => setForm({ ...form, model })} />
          <TextField id="serie-inv" label="Número de série" value={form.serialNumber} onChange={(serialNumber) => setForm({ ...form, serialNumber })} />
          <TextField id="pot-inv" label="Potência nominal (kW)" value={form.ratedPowerKw} onChange={(ratedPowerKw) => setForm({ ...form, ratedPowerKw })} />
          <TextField
            id="ext-inv"
            label="Identificador externo"
            value={form.externalId}
            onChange={(externalId) => setForm({ ...form, externalId })}
            hint="Opcional — utilizado quando fornecido pelo fabricante/API. A identidade oficial da integração fica no IntegrationBinding."
          />
          {!editing ? <SelectField id="status-inv" label="Status" value={form.status} options={RECORD_STATUS_OPTIONS} onChange={(status) => setForm({ ...form, status })} /> : null}
        </div>
      </Modal>
    </div>
  );
}

export default function InversoresPage() {
  return (
    <Suspense fallback={<LoadingState message="Carregando inversores..." />}>
      <InversoresContent />
    </Suspense>
  );
}
