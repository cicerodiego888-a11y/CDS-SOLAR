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
import {
  applyPlantUnitSelection,
  consumerUnitLabel,
  plantConsumerUnitDisplay,
  plantDistributorDisplay,
  plantEnergyFieldMode,
} from '../../lib/consumer-units';
import { can, parsePowerKw, PLANT_STATUS_OPTIONS, plantOperationalLabel } from '../../lib/operational';
import { formatDateTime, formatPowerKw } from '../../lib/format';
import {
  PLANT_STATE_FILTERS,
  plantOperationalFilterLabel,
  type OperationalIntegrationState,
} from '../../lib/plant-integration-state';
import type { DashboardOverview } from '../../lib/dashboard';

type Customer = { id: string; name: string };
type ConsumerUnitOption = {
  id: string;
  number: string;
  contractAccount?: string | null;
  status: string;
  distributor?: { id: string; name: string; code?: string } | null;
};
type Plant = {
  id: string;
  name: string;
  customerId: string;
  customer?: { name: string };
  installedPowerKw?: string | number | null;
  distributor?: string | null;
  consumerUnit?: string | null;
  consumerUnitId?: string | null;
  consumerUnitRef?: {
    id: string;
    number: string;
    contractAccount?: string | null;
    distributor?: { id: string; name: string } | null;
  } | null;
  address?: string | null;
  status: string;
  _count?: { inverters: number; equipment: number };
};

const emptyForm = {
  customerId: '',
  name: '',
  installedPowerKw: '',
  distributor: '',
  consumerUnit: '',
  consumerUnitId: '',
  address: '',
  status: 'ACTIVE',
};

function UsinasContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const presetCustomer = searchParams.get('cliente') || '';
  const [rows, setRows] = useState<Plant[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [unitsByCustomer, setUnitsByCustomer] = useState<Record<string, ConsumerUnitOption[]>>({});
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [opsByPlant, setOpsByPlant] = useState<Record<string, {
    integrationState: OperationalIntegrationState;
    currentPowerKw: number | null;
    currentPowerHasData: boolean;
    lastReadingAt: string | null;
    openAlerts: number;
  }>>({});
  const { open, editing, form, setForm, openCreate: startCreate, openEdit: startEdit, close, clearAfterSave } = useDraftModal<typeof emptyForm, Plant>(emptyForm);
  const [formError, setFormError] = useState('');

  async function loadUnitsForCustomer(customerId: string) {
    if (!customerId || unitsByCustomer[customerId]) return;
    try {
      const units = await fetchApi<ConsumerUnitOption[]>(`/customers/${customerId}/consumer-units`);
      setUnitsByCustomer((current) => ({ ...current, [customerId]: units }));
    } catch {
      setUnitsByCustomer((current) => ({ ...current, [customerId]: [] }));
    }
  }

  async function load() {
    try {
      setError('');
      const [plants, customerRows] = await Promise.all([
        fetchApi<Plant[]>('/plants'),
        fetchApi<Customer[]>('/customers'),
      ]);
      setRows(plants);
      setCustomers(customerRows);
      try {
        const overview = await fetchApi<DashboardOverview>('/monitoring/overview?period=today');
        const map: typeof opsByPlant = {};
        for (const plant of overview.dashboard.operationalPlants ?? overview.dashboard.recentPlants) {
          map[plant.id] = {
            integrationState: (plant.integrationState || 'NOT_CONFIGURED') as OperationalIntegrationState,
            currentPowerKw: plant.currentPowerKw ?? null,
            currentPowerHasData: Boolean(plant.currentPowerHasData),
            lastReadingAt: plant.lastReadingAt ?? null,
            openAlerts: plant.openAlerts ?? 0,
          };
        }
        setOpsByPlant(map);
      } catch {
        setOpsByPlant({});
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as usinas.');
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (form.customerId) void loadUnitsForCustomer(form.customerId);
  }, [form.customerId]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return (rows || []).filter((row) => {
      const matchesCustomer = !presetCustomer || row.customerId === presetCustomer;
      const matchesSearch = [
        row.name,
        row.customer?.name,
        plantDistributorDisplay(row),
        plantConsumerUnitDisplay(row),
      ].some((value) => value?.toLowerCase().includes(term));
      const state = opsByPlant[row.id]?.integrationState || 'NOT_CONFIGURED';
      const matchesState = stateFilter === 'ALL' || state === stateFilter
        || (stateFilter === 'NOT_CONFIGURED' && (state === 'NOT_CONFIGURED'));
      return matchesCustomer && matchesSearch && matchesState;
    });
  }, [rows, search, presetCustomer, stateFilter, opsByPlant]);

  const availableUnits = unitsByCustomer[form.customerId] || [];
  const unitsLoaded = !form.customerId || Object.prototype.hasOwnProperty.call(unitsByCustomer, form.customerId);
  const fieldMode = plantEnergyFieldMode(unitsLoaded, availableUnits.length);
  const hasEnergyUnits = fieldMode === 'formal';

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
      distributor: item.consumerUnitRef?.distributor?.name || item.distributor || '',
      consumerUnit: item.consumerUnitRef?.number || item.consumerUnit || '',
      consumerUnitId: item.consumerUnitId || item.consumerUnitRef?.id || '',
      address: item.address || '',
      status: item.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    }));
  }

  function changeCustomer(customerId: string) {
    setForm({
      ...form,
      customerId,
      consumerUnitId: '',
      distributor: '',
      consumerUnit: '',
    });
  }

  function changeUnit(consumerUnitId: string) {
    const unit = availableUnits.find((item) => item.id === consumerUnitId) || null;
    const next = applyPlantUnitSelection(
      {
        customerId: form.customerId,
        consumerUnitId: form.consumerUnitId,
        distributor: form.distributor,
        consumerUnit: form.consumerUnit,
      },
      unit,
    );
    setForm({ ...form, ...next });
  }

  async function save() {
    const installedPowerKw = parsePowerKw(form.installedPowerKw);
    if (!form.customerId) {
      setFormError('Selecione o cliente.');
      return;
    }
    if (fieldMode === 'loading') {
      setFormError('Aguarde o carregamento das unidades consumidoras.');
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
      address: form.address.trim() || undefined,
      ...(editing ? {} : { status: form.status }),
      ...(hasEnergyUnits
        ? {
            consumerUnitId: form.consumerUnitId || null,
          }
        : {
            distributor: form.distributor.trim() || undefined,
            consumerUnit: form.consumerUnit.trim() || undefined,
          }),
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

  const emptyContent = search.trim() || stateFilter !== 'ALL' || presetCustomer
    ? <EmptyState title="Nenhuma usina encontrada" description="Nenhum registro corresponde aos filtros atuais." />
    : <EmptyState title="Nenhum registro encontrado" description="Cadastre uma usina vinculada a um cliente." />;

  return (
    <div className="shell plants-page">
      <PageHeader
        eyebrow="Ativos"
        title="Usinas"
        description="Central operacional: quais usinas operam e quais precisam de atenção."
        actions={can(user, 'PLANTS_CREATE') ? <Button type="button" onClick={openCreate}>Nova usina</Button> : null}
      />
      {error ? <ErrorMessage message={error} /> : null}
      {!rows && !error ? <LoadingState message="Carregando usinas..." /> : null}
      {rows ? (
        <section className="plants-panel">
          <div className="toolbar plants-toolbar">
            <div className="toolbar-filters">
              <TextField
                id="busca-usina"
                label="Buscar"
                value={search}
                onChange={setSearch}
                placeholder="Usina, cliente ou concessionária"
              />
              <SelectField
                id="filtro-estado"
                label="Estado operacional"
                value={stateFilter}
                options={PLANT_STATE_FILTERS.map((item) => ({ value: item.value, label: item.label }))}
                onChange={setStateFilter}
              />
            </div>
            <p className="plants-count" aria-live="polite">
              {filtered.length} de {rows.length} usina{rows.length === 1 ? '' : 's'}
            </p>
          </div>
          <DataTable
            rows={filtered}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'name',
                header: 'Nome da usina',
                render: (row) => <Link className="plants-name-link" href={`/usinas/${row.id}`}>{row.name}</Link>,
              },
              { key: 'location', header: 'Localização', render: (row) => row.address || '—' },
              {
                key: 'integration',
                header: 'Integração',
                render: (row) => plantOperationalFilterLabel(opsByPlant[row.id]?.integrationState || 'NOT_CONFIGURED'),
              },
              {
                key: 'powerNow',
                header: 'Potência atual',
                render: (row) => formatPowerKw(
                  opsByPlant[row.id]?.currentPowerKw ?? null,
                  Boolean(opsByPlant[row.id]?.currentPowerHasData),
                ),
              },
              {
                key: 'lastReading',
                header: 'Última leitura',
                render: (row) => (opsByPlant[row.id]?.lastReadingAt
                  ? formatDateTime(opsByPlant[row.id].lastReadingAt!)
                  : 'Sem dados de monitoramento'),
              },
              {
                key: 'alerts',
                header: 'Alertas',
                render: (row) => (opsByPlant[row.id] ? String(opsByPlant[row.id].openAlerts) : '—'),
              },
              {
                key: 'status',
                header: 'Cadastro',
                render: (row) => <StatusBadge label={plantOperationalLabel(row.status)} status={row.status} />,
              },
              {
                key: 'actions',
                header: 'Ações',
                render: (row) => (
                  <div className="actions-cell">
                    {can(user, 'PLANTS_UPDATE') ? (
                      <Button type="button" variant="secondary" onClick={() => openEdit(row)}>Editar</Button>
                    ) : null}
                    {can(user, 'PLANTS_UPDATE') ? (
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
        title={editing ? 'Editar usina' : 'Nova usina'}
        error={formError}
        confirmDisabled={fieldMode === 'loading'}
        onClose={close}
        onConfirm={() => void save()}
      >
        <div className="form-grid">
          <SelectField
            id="cliente"
            label="Cliente"
            value={form.customerId}
            options={customers.map((item) => ({ value: item.id, label: item.name }))}
            placeholder="Selecione o cliente"
            onChange={changeCustomer}
          />
          {fieldMode === 'loading' ? (
            <p className="plants-muted">Carregando unidades consumidoras...</p>
          ) : hasEnergyUnits ? (
            <>
              <SelectField
                id="uc-vinculo"
                label="Unidade consumidora"
                value={form.consumerUnitId}
                options={availableUnits.map((unit) => ({ value: unit.id, label: consumerUnitLabel(unit) }))}
                placeholder="Selecione a unidade consumidora"
                onChange={changeUnit}
                hint="Vínculo formal com ConsumerUnit."
              />
              <TextField
                id="concessionaria"
                label="Distribuidora"
                value={form.distributor}
                disabled
                onChange={() => undefined}
                hint="Derivada da unidade consumidora formal."
              />
            </>
          ) : (
            <>
              <TextField
                id="concessionaria"
                label="Concessionária"
                value={form.distributor}
                onChange={(distributor) => setForm({ ...form, distributor })}
                hint="Campo legado quando o cliente ainda não possui UC formal."
              />
              <TextField
                id="uc"
                label="Unidade consumidora"
                value={form.consumerUnit}
                onChange={(consumerUnit) => setForm({ ...form, consumerUnit })}
                hint="Referência legada (Plant.consumerUnit) — não é ConsumerUnit formal."
              />
            </>
          )}
          <TextField id="nome-usina" label="Nome da usina" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <TextField
            id="potencia"
            label="Potência instalada (kW)"
            value={form.installedPowerKw}
            onChange={(installedPowerKw) => setForm({ ...form, installedPowerKw })}
          />
          <TextField id="endereco" label="Endereço" value={form.address} onChange={(address) => setForm({ ...form, address })} />
          {!editing ? (
            <SelectField
              id="status-usina"
              label="Status"
              value={form.status}
              options={PLANT_STATUS_OPTIONS}
              onChange={(status) => setForm({ ...form, status })}
            />
          ) : null}
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
