'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
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
import { can, formatPower, parsePowerKw, PLANT_STATUS_OPTIONS, plantOperationalLabel } from '../../lib/operational';

type Customer = { id: string; name: string };
type Plant = {
  id: string;
  name: string;
  customerId: string;
  customer?: { name: string };
  installedPowerKw?: string | number | null;
  distributor?: string | null;
  consumerUnit?: string | null;
  address?: string | null;
  status: string;
  _count?: { inverters: number; equipment: number };
};

const emptyForm = { customerId: '', name: '', installedPowerKw: '', distributor: '', consumerUnit: '', address: '', status: 'ACTIVE' };

function UsinasContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const presetCustomer = searchParams.get('cliente') || '';
  const [rows, setRows] = useState<Plant[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const { open, editing, form, setForm, openCreate: startCreate, openEdit: startEdit, close, clearAfterSave } = useDraftModal<typeof emptyForm, Plant>(emptyForm);
  const [formError, setFormError] = useState('');

  async function load() {
    try {
      setError('');
      const [plants, customerRows] = await Promise.all([
        fetchApi<Plant[]>('/plants'),
        fetchApi<Customer[]>('/customers'),
      ]);
      setRows(plants);
      setCustomers(customerRows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as usinas.');
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return (rows || []).filter((row) => {
      const matchesCustomer = !presetCustomer || row.customerId === presetCustomer;
      const matchesSearch = [row.name, row.customer?.name, row.distributor, row.consumerUnit].some((value) => value?.toLowerCase().includes(term));
      return matchesCustomer && matchesSearch;
    });
  }, [rows, search, presetCustomer]);

  function openCreate() {
    setFormError('');
    startCreate({ customerId: presetCustomer });
  }

  function openEdit(row: Plant) {
    setFormError('');
    startEdit(row, (item) => ({
      customerId: item.customerId,
      name: item.name,
      installedPowerKw: String(item.installedPowerKw ?? ''),
      distributor: item.distributor || '',
      consumerUnit: item.consumerUnit || '',
      address: item.address || '',
      status: item.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    }));
  }

  async function save() {
    const installedPowerKw = parsePowerKw(form.installedPowerKw);
    if (!form.customerId) {
      setFormError('Selecione o cliente.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Informe o nome da usina.');
      return;
    }
    if (installedPowerKw === undefined) {
      setFormError('Informe a potência instalada em kW. Use ponto ou vírgula, por exemplo 10,5.');
      return;
    }
    const payload = {
      customerId: form.customerId,
      name: form.name.trim(),
      installedPowerKw,
      distributor: form.distributor.trim() || undefined,
      consumerUnit: form.consumerUnit.trim() || undefined,
      address: form.address.trim() || undefined,
      ...(editing ? {} : { status: form.status }),
    };
    try {
      setFormError('');
      if (editing) await fetchApi(`/plants/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await fetchApi('/plants', { method: 'POST', body: JSON.stringify(payload) });
      clearAfterSave();
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível salvar a usina.';
      setFormError(message);
    }
  }

  async function toggleStatus(row: Plant) {
    const status = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await fetchApi(`/plants/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  }

  return (
    <div className="shell">
      <PageHeader title="Usinas" description="Cadastro operacional das usinas fotovoltaicas." />
      {error ? <ErrorMessage message={error} /> : null}
      {!rows && !error ? <LoadingState message="Carregando usinas..." /> : null}
      {rows ? (
        <section className="panel">
          <div className="toolbar">
            <TextField id="busca-usina" label="Buscar" value={search} onChange={setSearch} placeholder="Usina, cliente ou concessionária" />
            {can(user, 'PLANTS_CREATE') ? <Button onClick={openCreate}>Nova usina</Button> : null}
          </div>
          <DataTable
            rows={filtered}
            rowKey={(row) => row.id}
            columns={[
              { key: 'name', header: 'Nome da usina', render: (row) => <Link href={`/usinas/${row.id}`}>{row.name}</Link> },
              { key: 'customer', header: 'Cliente', render: (row) => row.customer?.name || '—' },
              { key: 'power', header: 'Potência instalada', render: (row) => formatPower(row.installedPowerKw) },
              { key: 'distributor', header: 'Concessionária', render: (row) => row.distributor || '—' },
              { key: 'uc', header: 'Unidade consumidora', render: (row) => row.consumerUnit || '—' },
              { key: 'inverters', header: 'Inversores', render: (row) => row._count?.inverters ?? 0 },
              { key: 'equipment', header: 'Equipamentos', render: (row) => row._count?.equipment ?? 0 },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge label={plantOperationalLabel(row.status)} status={row.status} /> },
              {
                key: 'actions',
                header: 'Ações',
                render: (row) => (
                  <div className="actions-cell">
                    {can(user, 'PLANTS_UPDATE') ? <Button variant="secondary" onClick={() => openEdit(row)}>Editar</Button> : null}
                    {can(user, 'PLANTS_UPDATE') ? <Button variant="ghost" onClick={() => void toggleStatus(row)}>{row.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}</Button> : null}
                  </div>
                ),
              },
            ]}
            empty={<EmptyState title="Nenhum registro encontrado" description="Cadastre uma usina vinculada a um cliente." />}
          />
        </section>
      ) : null}
      <Modal open={open} title={editing ? 'Editar usina' : 'Nova usina'} error={formError} onClose={close} onConfirm={() => void save()}>
        <div className="form-grid">
          <SelectField id="cliente" label="Cliente" value={form.customerId} options={customers.map((item) => ({ value: item.id, label: item.name }))} placeholder="Selecione o cliente" onChange={(customerId) => setForm({ ...form, customerId })} />
          <TextField id="nome-usina" label="Nome da usina" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <TextField id="potencia" label="Potência instalada (kW)" value={form.installedPowerKw} onChange={(installedPowerKw) => setForm({ ...form, installedPowerKw })} />
          <TextField id="concessionaria" label="Concessionária" value={form.distributor} onChange={(distributor) => setForm({ ...form, distributor })} />
          <TextField id="uc" label="Unidade consumidora" value={form.consumerUnit} onChange={(consumerUnit) => setForm({ ...form, consumerUnit })} />
          <TextField id="endereco" label="Endereço" value={form.address} onChange={(address) => setForm({ ...form, address })} />
          {!editing ? <SelectField id="status-usina" label="Status" value={form.status} options={PLANT_STATUS_OPTIONS} onChange={(status) => setForm({ ...form, status })} /> : null}
        </div>
      </Modal>
    </div>
  );
}

export default function UsinasPage() {
  return (
    <Suspense fallback={<LoadingState message="Carregando usinas..." />}>
      <UsinasContent />
    </Suspense>
  );
}
