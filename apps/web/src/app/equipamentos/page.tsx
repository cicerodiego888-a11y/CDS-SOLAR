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
import { can, EQUIPMENT_TYPE_OPTIONS, equipmentTypeLabel, RECORD_STATUS_OPTIONS, recordStatusLabel } from '../../lib/operational';

type Plant = { id: string; name: string };
type Inverter = { id: string; model?: string | null; serialNumber?: string | null; plantId: string };
type Equipment = {
  id: string;
  type: string;
  manufacturerName?: string | null;
  model?: string | null;
  serialNumber: string;
  status: string;
  notes?: string | null;
  plantId: string;
  inverterId?: string | null;
  plant?: { name: string };
};

const emptyForm = { plantId: '', type: 'OUTRO', manufacturerName: '', model: '', serialNumber: '', inverterId: '', notes: '', status: 'ACTIVE' };

function EquipamentosContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Equipment[] | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [inverters, setInverters] = useState<Inverter[]>([]);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [filters, setFilters] = useState({ plantId: searchParams.get('usina') || '', type: '', status: '' });
  const { open, editing, form, setForm, openCreate: startCreate, openEdit: startEdit, close, clearAfterSave } = useDraftModal<typeof emptyForm, Equipment>(emptyForm);

  async function load() {
    try {
      setError('');
      const query = new URLSearchParams();
      if (filters.plantId) query.set('plantId', filters.plantId);
      if (filters.type) query.set('type', filters.type);
      if (filters.status) query.set('status', filters.status);
      const [items, plantRows, inverterRows] = await Promise.all([
        fetchApi<Equipment[]>(`/equipment${query.toString() ? `?${query}` : ''}`),
        fetchApi<Plant[]>('/plants'),
        fetchApi<Inverter[]>('/inverters'),
      ]);
      setRows(items);
      setPlants(plantRows);
      setInverters(inverterRows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os equipamentos.');
    }
  }

  useEffect(() => { void load(); }, [filters.plantId, filters.type, filters.status]);

  function openCreate() {
    setFormError('');
    startCreate({ plantId: filters.plantId });
  }

  function openEdit(row: Equipment) {
    setFormError('');
    startEdit(row, (item) => ({
      plantId: item.plantId,
      type: item.type,
      manufacturerName: item.manufacturerName || '',
      model: item.model || '',
      serialNumber: item.serialNumber,
      inverterId: item.inverterId || '',
      notes: item.notes || '',
      status: item.status,
    }));
  }

  async function save() {
    const payload = {
      plantId: form.plantId,
      type: form.type,
      manufacturerName: form.manufacturerName,
      model: form.model,
      serialNumber: form.serialNumber,
      inverterId: form.type === 'INVERSOR' ? form.inverterId || undefined : undefined,
      notes: form.notes,
      ...(editing ? {} : { status: form.status }),
    };
    try {
      setFormError('');
      if (editing) await fetchApi(`/equipment/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await fetchApi('/equipment', { method: 'POST', body: JSON.stringify(payload) });
      clearAfterSave();
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o equipamento.');
    }
  }

  async function toggleStatus(row: Equipment) {
    const status = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await fetchApi(`/equipment/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  }

  const plantInverters = inverters.filter((item) => item.plantId === form.plantId);

  return (
    <div className="shell">
      <PageHeader title="Equipamentos" description="Inventário operacional das usinas, sem lógica específica de fabricante." />
      {error ? <ErrorMessage message={error} /> : null}
      {!rows && !error ? <LoadingState message="Carregando equipamentos..." /> : null}
      {rows ? (
        <section className="panel">
          <div className="toolbar">
            <div className="toolbar-filters">
              <SelectField id="eq-usina" label="Usina" value={filters.plantId} options={plants.map((item) => ({ value: item.id, label: item.name }))} placeholder="Todas" onChange={(plantId) => setFilters({ ...filters, plantId })} />
              <SelectField id="eq-tipo" label="Tipo" value={filters.type} options={EQUIPMENT_TYPE_OPTIONS} placeholder="Todos" onChange={(type) => setFilters({ ...filters, type })} />
              <SelectField id="eq-status" label="Status" value={filters.status} options={RECORD_STATUS_OPTIONS} placeholder="Todos" onChange={(status) => setFilters({ ...filters, status })} />
            </div>
            {can(user, 'EQUIPMENT_CREATE') ? <Button onClick={openCreate}>Novo equipamento</Button> : null}
          </div>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              { key: 'name', header: 'Equipamento', render: (row) => row.model || equipmentTypeLabel(row.type) },
              { key: 'type', header: 'Tipo', render: (row) => equipmentTypeLabel(row.type) },
              { key: 'plant', header: 'Usina', render: (row) => <Link href={`/usinas/${row.plantId}`}>{row.plant?.name || '—'}</Link> },
              { key: 'manufacturer', header: 'Fabricante', render: (row) => row.manufacturerName || '—' },
              { key: 'model', header: 'Modelo', render: (row) => row.model || '—' },
              { key: 'serial', header: 'Número de série', render: (row) => row.serialNumber },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge label={recordStatusLabel(row.status)} status={row.status} /> },
              {
                key: 'actions',
                header: 'Ações',
                render: (row) => (
                  <div className="actions-cell">
                    {can(user, 'EQUIPMENT_UPDATE') ? <Button variant="secondary" onClick={() => openEdit(row)}>Editar</Button> : null}
                    {can(user, 'EQUIPMENT_UPDATE') ? <Button variant="ghost" onClick={() => void toggleStatus(row)}>{row.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}</Button> : null}
                  </div>
                ),
              },
            ]}
            empty={<EmptyState title="Nenhum registro encontrado" description="Cadastre equipamentos vinculados a uma usina." />}
          />
        </section>
      ) : null}
      <Modal open={open} title={editing ? 'Editar equipamento' : 'Novo equipamento'} error={formError} onClose={close} onConfirm={() => void save()}>
        <div className="form-grid">
          <SelectField id="eq-form-usina" label="Usina" value={form.plantId} options={plants.map((item) => ({ value: item.id, label: item.name }))} placeholder="Selecione a usina" onChange={(plantId) => setForm({ ...form, plantId, inverterId: '' })} />
          <SelectField id="eq-form-tipo" label="Tipo" value={form.type} options={EQUIPMENT_TYPE_OPTIONS} onChange={(type) => setForm({ ...form, type })} />
          {form.type === 'INVERSOR' ? (
            <SelectField
              id="eq-form-inv"
              label="Inversor vinculado"
              value={form.inverterId}
              options={plantInverters.map((item) => ({ value: item.id, label: item.model || item.serialNumber || item.id }))}
              placeholder="Selecione o inversor"
              onChange={(inverterId) => setForm({ ...form, inverterId })}
            />
          ) : null}
          <TextField id="eq-fab" label="Fabricante" value={form.manufacturerName} onChange={(manufacturerName) => setForm({ ...form, manufacturerName })} />
          <TextField id="eq-mod" label="Modelo" value={form.model} onChange={(model) => setForm({ ...form, model })} />
          <TextField id="eq-serie" label="Número de série" value={form.serialNumber} onChange={(serialNumber) => setForm({ ...form, serialNumber })} />
          <TextField id="eq-obs" label="Observação" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} />
          {!editing ? <SelectField id="eq-form-status" label="Status" value={form.status} options={RECORD_STATUS_OPTIONS} onChange={(status) => setForm({ ...form, status })} /> : null}
        </div>
      </Modal>
    </div>
  );
}

export default function EquipamentosPage() {
  return (
    <Suspense fallback={<LoadingState message="Carregando equipamentos..." />}>
      <EquipamentosContent />
    </Suspense>
  );
}
