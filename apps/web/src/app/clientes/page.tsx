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

type Customer = {
  id: string;
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  _count?: { plants: number };
};

const emptyForm = { name: '', document: '', email: '', phone: '', status: 'ACTIVE' };

export default function ClientesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const { open, editing, form, setForm, openCreate, openEdit: startEdit, close, clearAfterSave } = useDraftModal<typeof emptyForm, Customer>(emptyForm);

  async function load() {
    try {
      setError('');
      setRows(await fetchApi<Customer[]>('/customers'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os clientes.');
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return (rows || []).filter((row) =>
      [row.name, row.document, row.email, row.phone].some((value) => value?.toLowerCase().includes(term)),
    );
  }, [rows, search]);

  function openNew() {
    setFormError('');
    openCreate();
  }

  function openEdit(row: Customer) {
    setFormError('');
    startEdit(row, (item) => ({
      name: item.name,
      document: item.document || '',
      email: item.email || '',
      phone: item.phone || '',
      status: item.status,
    }));
  }

  async function save() {
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
    const payload = {
      name: text(form.name),
      document: text(form.document),
      email: text(form.email) || null,
      phone: text(form.phone) || null,
    };
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await fetchApi(`/customers/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await fetchApi('/customers', { method: 'POST', body: JSON.stringify({ ...payload, status: form.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE' }) });
      }
      clearAfterSave();
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o cliente.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(row: Customer) {
    const status = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await fetchApi(`/customers/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  }

  const emptyContent = search.trim()
    ? <EmptyState title="Nenhum cliente encontrado" description="Nenhum registro corresponde à busca atual." />
    : <EmptyState title="Nenhum registro encontrado" description="Cadastre o primeiro cliente para vincular usinas." />;

  return (
    <div className="shell customers-page">
      <PageHeader
        eyebrow="Cadastros"
        title="Clientes"
        description="Cadastro operacional dos clientes da B7 Solar."
        actions={can(user, 'CUSTOMERS_CREATE') ? <Button type="button" onClick={openNew}>Novo cliente</Button> : null}
      />

      {error ? <ErrorMessage message={error} /> : null}
      {!rows && !error ? <LoadingState message="Carregando clientes..." /> : null}

      {rows ? (
        <section className="customers-panel">
          <div className="toolbar customers-toolbar">
            <div className="toolbar-filters">
              <TextField
                id="busca-cliente"
                label="Buscar"
                value={search}
                onChange={setSearch}
                placeholder="Nome, documento ou e-mail"
              />
            </div>
            <p className="customers-count" aria-live="polite">
              {filtered.length} de {rows.length} cliente{rows.length === 1 ? '' : 's'}
            </p>
          </div>
          <DataTable
            rows={filtered}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'name',
                header: 'Cliente',
                render: (row) => (
                  <Link className="customers-name-link" href={`/clientes/${row.id}`}>{row.name}</Link>
                ),
              },
              { key: 'document', header: 'Documento', render: (row) => row.document || '—' },
              { key: 'phone', header: 'Telefone', render: (row) => row.phone || '—' },
              { key: 'email', header: 'E-mail', render: (row) => row.email || '—' },
              { key: 'plants', header: 'Usinas', render: (row) => row._count?.plants ?? 0 },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <StatusBadge label={recordStatusLabel(row.status)} status={row.status} />,
              },
              {
                key: 'actions',
                header: 'Ações',
                render: (row) => (
                  <div className="actions-cell">
                    {can(user, 'CUSTOMERS_UPDATE') ? (
                      <Button type="button" variant="secondary" onClick={() => openEdit(row)}>Editar</Button>
                    ) : null}
                    {can(user, 'CUSTOMERS_UPDATE') ? (
                      <Button type="button" variant="ghost" onClick={() => void toggleStatus(row)}>
                        {row.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}
                      </Button>
                    ) : null}
                  </div>
                ),
              },
            ]}
            empty={emptyContent}
          />
        </section>
      ) : null}

      <Modal
        open={open}
        title={editing ? 'Editar cliente' : 'Novo cliente'}
        error={formError}
        confirmDisabled={saving}
        onClose={close}
        onConfirm={() => void save()}
        confirmLabel={saving ? 'Salvando...' : 'Salvar'}
      >
        <div className="form-grid">
          <TextField id="nome" label="Nome" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <TextField id="documento" label="CPF/CNPJ" value={form.document} onChange={(document) => setForm({ ...form, document })} />
          <TextField id="email" label="E-mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
          <TextField id="telefone" label="Telefone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          {!editing ? (
            <SelectField
              id="status"
              label="Status"
              value={form.status}
              options={RECORD_STATUS_OPTIONS}
              onChange={(status) => setForm({ ...form, status })}
            />
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
