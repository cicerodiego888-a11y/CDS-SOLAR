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
import { can, DOCUMENT_TYPE_OPTIONS, RECORD_STATUS_OPTIONS, recordStatusLabel } from '../../lib/operational';

type Consumer = {
  id: string;
  name: string;
  document: string;
  documentType: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  _count?: { consumerUnits: number };
};

const emptyForm = { name: '', document: '', documentType: 'CPF', email: '', phone: '', status: 'ACTIVE' };

export default function ConsumidoresPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Consumer[] | null>(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const { open, editing, form, setForm, openCreate, openEdit: startEdit, close, clearAfterSave } = useDraftModal<typeof emptyForm, Consumer>(emptyForm);

  async function load() {
    try {
      setError('');
      setRows(await fetchApi<Consumer[]>('/consumers'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os consumidores.');
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

  function openEdit(row: Consumer) {
    setFormError('');
    startEdit(row, (item) => ({
      name: item.name,
      document: item.document,
      documentType: item.documentType,
      email: item.email || '',
      phone: item.phone || '',
      status: item.status,
    }));
  }

  async function save() {
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await fetchApi(`/consumers/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name,
            document: form.document,
            documentType: form.documentType,
            email: form.email,
            phone: form.phone,
          }),
        });
      } else {
        await fetchApi('/consumers', { method: 'POST', body: JSON.stringify(form) });
      }
      clearAfterSave();
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o consumidor.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(row: Consumer) {
    const status = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await fetchApi(`/consumers/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  }

  return (
    <div className="shell">
      <PageHeader title="Consumidores" description="Titulares do domínio energético (distintos dos clientes operacionais)." />
      {error ? <ErrorMessage message={error} /> : null}
      {!rows && !error ? <LoadingState message="Carregando consumidores..." /> : null}
      {rows ? (
        <section className="panel">
          <div className="toolbar">
            <div className="toolbar-filters">
              <TextField id="busca-consumidor" label="Buscar" value={search} onChange={setSearch} placeholder="Nome, documento ou e-mail" />
            </div>
            {can(user, 'CONSUMERS_CREATE') ? <Button onClick={openNew}>Novo consumidor</Button> : null}
          </div>
          <DataTable
            rows={filtered}
            rowKey={(row) => row.id}
            columns={[
              { key: 'name', header: 'Consumidor', render: (row) => <Link href={`/consumidores/${row.id}`}>{row.name}</Link> },
              { key: 'document', header: 'Documento', render: (row) => `${row.documentType} ${row.document}` },
              { key: 'phone', header: 'Telefone', render: (row) => row.phone || '—' },
              { key: 'email', header: 'E-mail', render: (row) => row.email || '—' },
              { key: 'ucs', header: 'UCs', render: (row) => row._count?.consumerUnits ?? 0 },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge label={recordStatusLabel(row.status)} status={row.status} /> },
              {
                key: 'actions',
                header: 'Ações',
                render: (row) => (
                  <div className="actions-cell">
                    {can(user, 'CONSUMERS_UPDATE') ? <Button variant="secondary" onClick={() => openEdit(row)}>Editar</Button> : null}
                    {can(user, 'CONSUMERS_UPDATE') ? <Button variant="ghost" onClick={() => void toggleStatus(row)}>{row.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}</Button> : null}
                  </div>
                ),
              },
            ]}
            empty={<EmptyState title="Nenhum registro encontrado" description="Cadastre o primeiro consumidor titular de UC." />}
          />
        </section>
      ) : null}

      <Modal open={open} title={editing ? 'Editar consumidor' : 'Novo consumidor'} error={formError} confirmDisabled={saving} onClose={close} onConfirm={() => void save()} confirmLabel={saving ? 'Salvando...' : 'Salvar'}>
        <div className="form-grid">
          <TextField id="nome" label="Nome" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <SelectField id="tipo-doc" label="Tipo de documento" value={form.documentType} options={DOCUMENT_TYPE_OPTIONS} onChange={(documentType) => setForm({ ...form, documentType })} />
          <TextField id="documento" label="Documento" value={form.document} onChange={(document) => setForm({ ...form, document })} />
          <TextField id="email" label="E-mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
          <TextField id="telefone" label="Telefone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          {!editing ? <SelectField id="status" label="Status" value={form.status} options={RECORD_STATUS_OPTIONS} onChange={(status) => setForm({ ...form, status })} /> : null}
        </div>
      </Modal>
    </div>
  );
}
