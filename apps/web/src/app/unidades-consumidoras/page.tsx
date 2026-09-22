'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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
import { can, RECORD_STATUS_OPTIONS, recordStatusLabel } from '../../lib/operational';

type ConsumerUnit = {
  id: string;
  number: string;
  address?: string | null;
  status: string;
  consumerId: string;
  distributorId: string;
  consumer?: { id: string; name: string };
  distributor?: { id: string; name: string; code: string };
};

type ConsumerOption = { id: string; name: string; status: string };
type DistributorOption = { id: string; name: string; code: string; status: string };

const emptyForm = { consumerId: '', distributorId: '', number: '', address: '', status: 'ACTIVE' };

export default function UnidadesConsumidorasPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ConsumerUnit[] | null>(null);
  const [consumers, setConsumers] = useState<ConsumerOption[]>([]);
  const [distributors, setDistributors] = useState<DistributorOption[]>([]);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const { open, editing, form, setForm, openCreate, openEdit: startEdit, close, clearAfterSave } = useDraftModal<typeof emptyForm, ConsumerUnit>(emptyForm);

  async function load() {
    try {
      setError('');
      const [units, consumerRows, distributorRows] = await Promise.all([
        fetchApi<ConsumerUnit[]>('/consumer-units'),
        fetchApi<ConsumerOption[]>('/consumers'),
        fetchApi<DistributorOption[]>('/distributors'),
      ]);
      setRows(units);
      setConsumers(consumerRows.filter((row) => row.status === 'ACTIVE'));
      setDistributors(distributorRows.filter((row) => row.status === 'ACTIVE'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as unidades consumidoras.');
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return (rows || []).filter((row) =>
      [row.number, row.address, row.consumer?.name, row.distributor?.name, row.distributor?.code]
        .some((value) => value?.toLowerCase().includes(term)),
    );
  }, [rows, search]);

  const consumerOptions = useMemo(
    () => consumers.map((row) => ({ value: row.id, label: row.name })),
    [consumers],
  );
  const distributorOptions = useMemo(
    () => distributors.map((row) => ({ value: row.id, label: `${row.name} (${row.code})` })),
    [distributors],
  );

  function openNew() {
    setFormError('');
    openCreate();
  }

  function openEdit(row: ConsumerUnit) {
    setFormError('');
    startEdit(row, (item) => ({
      consumerId: item.consumerId,
      distributorId: item.distributorId,
      number: item.number,
      address: item.address || '',
      status: item.status,
    }));
  }

  async function save() {
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await fetchApi(`/consumer-units/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            consumerId: form.consumerId,
            distributorId: form.distributorId,
            number: form.number,
            address: form.address,
          }),
        });
      } else {
        await fetchApi('/consumer-units', { method: 'POST', body: JSON.stringify(form) });
      }
      clearAfterSave();
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar a unidade consumidora.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(row: ConsumerUnit) {
    const status = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await fetchApi(`/consumer-units/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  }

  return (
    <div className="shell">
      <PageHeader title="Unidades Consumidoras (UC)" description="Cadastro energético mínimo — independente de usinas e rateio." />
      {error ? <ErrorMessage message={error} /> : null}
      {!rows && !error ? <LoadingState message="Carregando unidades consumidoras..." /> : null}
      {rows ? (
        <section className="panel">
          <div className="toolbar">
            <div className="toolbar-filters">
              <TextField id="busca-uc" label="Buscar" value={search} onChange={setSearch} placeholder="Número, consumidor ou distribuidora" />
            </div>
            {can(user, 'CONSUMER_UNITS_CREATE') ? <Button onClick={openNew}>Nova UC</Button> : null}
          </div>
          <DataTable
            rows={filtered}
            rowKey={(row) => row.id}
            columns={[
              { key: 'number', header: 'Número da UC', render: (row) => <Link href={`/unidades-consumidoras/${row.id}`}>{row.number}</Link> },
              { key: 'consumer', header: 'Consumidor', render: (row) => row.consumer ? <Link href={`/consumidores/${row.consumer.id}`}>{row.consumer.name}</Link> : '—' },
              { key: 'distributor', header: 'Distribuidora', render: (row) => row.distributor ? <Link href={`/distribuidoras/${row.distributor.id}`}>{row.distributor.name}</Link> : '—' },
              { key: 'address', header: 'Endereço', render: (row) => row.address || '—' },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge label={recordStatusLabel(row.status)} status={row.status} /> },
              {
                key: 'actions',
                header: 'Ações',
                render: (row) => (
                  <div className="actions-cell">
                    {can(user, 'CONSUMER_UNITS_UPDATE') ? <Button variant="secondary" onClick={() => openEdit(row)}>Editar</Button> : null}
                    {can(user, 'CONSUMER_UNITS_UPDATE') ? <Button variant="ghost" onClick={() => void toggleStatus(row)}>{row.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}</Button> : null}
                  </div>
                ),
              },
            ]}
            empty={<EmptyState title="Nenhum registro encontrado" description="Cadastre consumidores e distribuidoras antes de criar UCs." />}
          />
        </section>
      ) : null}

      <Modal open={open} title={editing ? 'Editar UC' : 'Nova UC'} error={formError} confirmDisabled={saving} onClose={close} onConfirm={() => void save()} confirmLabel={saving ? 'Salvando...' : 'Salvar'}>
        <div className="form-grid">
          <SelectField id="consumidor" label="Consumidor titular" value={form.consumerId} options={consumerOptions} onChange={(consumerId) => setForm({ ...form, consumerId })} />
          <SelectField id="distribuidora" label="Distribuidora" value={form.distributorId} options={distributorOptions} onChange={(distributorId) => setForm({ ...form, distributorId })} />
          <TextField id="numero" label="Número da UC" value={form.number} onChange={(number) => setForm({ ...form, number })} />
          <TextField id="endereco" label="Endereço" value={form.address} onChange={(address) => setForm({ ...form, address })} />
          {!editing ? <SelectField id="status" label="Status" value={form.status} options={RECORD_STATUS_OPTIONS} onChange={(status) => setForm({ ...form, status })} /> : null}
        </div>
      </Modal>
    </div>
  );
}
