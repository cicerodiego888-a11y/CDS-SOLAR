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

type Distributor = {
  id: string;
  name: string;
  code: string;
  cnpj?: string | null;
  status: string;
  _count?: { consumerUnits: number };
};

const emptyForm = { name: '', code: '', cnpj: '', status: 'ACTIVE' };

export default function DistribuidorasPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Distributor[] | null>(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const { open, editing, form, setForm, openCreate, openEdit: startEdit, close, clearAfterSave } = useDraftModal<typeof emptyForm, Distributor>(emptyForm);

  async function load() {
    try {
      setError('');
      setRows(await fetchApi<Distributor[]>('/distributors'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as distribuidoras.');
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return (rows || []).filter((row) =>
      [row.name, row.code, row.cnpj].some((value) => value?.toLowerCase().includes(term)),
    );
  }, [rows, search]);

  function openNew() {
    setFormError('');
    openCreate();
  }

  function openEdit(row: Distributor) {
    setFormError('');
    startEdit(row, (item) => ({
      name: item.name,
      code: item.code,
      cnpj: item.cnpj || '',
      status: item.status,
    }));
  }

  async function save() {
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await fetchApi(`/distributors/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: form.name, code: form.code, cnpj: form.cnpj }),
        });
      } else {
        await fetchApi('/distributors', { method: 'POST', body: JSON.stringify(form) });
      }
      clearAfterSave();
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar a distribuidora.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(row: Distributor) {
    const status = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await fetchApi(`/distributors/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  }

  return (
    <div className="shell">
      <PageHeader title="Distribuidoras" description="Cadastro das concessionárias relacionadas às unidades consumidoras." />
      {error ? <ErrorMessage message={error} /> : null}
      {!rows && !error ? <LoadingState message="Carregando distribuidoras..." /> : null}
      {rows ? (
        <section className="panel">
          <div className="toolbar">
            <div className="toolbar-filters">
              <TextField id="busca-distribuidora" label="Buscar" value={search} onChange={setSearch} placeholder="Nome, código ou CNPJ" />
            </div>
            {can(user, 'DISTRIBUTORS_CREATE') ? <Button onClick={openNew}>Nova distribuidora</Button> : null}
          </div>
          <DataTable
            rows={filtered}
            rowKey={(row) => row.id}
            columns={[
              { key: 'name', header: 'Distribuidora', render: (row) => <Link href={`/distribuidoras/${row.id}`}>{row.name}</Link> },
              { key: 'code', header: 'Código', render: (row) => row.code },
              { key: 'cnpj', header: 'CNPJ', render: (row) => row.cnpj || '—' },
              { key: 'ucs', header: 'UCs', render: (row) => row._count?.consumerUnits ?? 0 },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge label={recordStatusLabel(row.status)} status={row.status} /> },
              {
                key: 'actions',
                header: 'Ações',
                render: (row) => (
                  <div className="actions-cell">
                    {can(user, 'DISTRIBUTORS_UPDATE') ? <Button variant="secondary" onClick={() => openEdit(row)}>Editar</Button> : null}
                    {can(user, 'DISTRIBUTORS_UPDATE') ? <Button variant="ghost" onClick={() => void toggleStatus(row)}>{row.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}</Button> : null}
                  </div>
                ),
              },
            ]}
            empty={<EmptyState title="Nenhum registro encontrado" description="Cadastre a primeira distribuidora para vincular UCs." />}
          />
        </section>
      ) : null}

      <Modal open={open} title={editing ? 'Editar distribuidora' : 'Nova distribuidora'} error={formError} confirmDisabled={saving} onClose={close} onConfirm={() => void save()} confirmLabel={saving ? 'Salvando...' : 'Salvar'}>
        <div className="form-grid">
          <TextField id="nome" label="Nome" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <TextField id="codigo" label="Código" value={form.code} onChange={(code) => setForm({ ...form, code })} />
          <TextField id="cnpj" label="CNPJ" value={form.cnpj} onChange={(cnpj) => setForm({ ...form, cnpj })} />
          {!editing ? <SelectField id="status" label="Status" value={form.status} options={RECORD_STATUS_OPTIONS} onChange={(status) => setForm({ ...form, status })} /> : null}
        </div>
      </Modal>
    </div>
  );
}
