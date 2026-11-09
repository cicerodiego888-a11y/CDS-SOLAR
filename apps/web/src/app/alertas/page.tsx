'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../components/auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHeader } from '../../components/ui/PageHeader';
import { SelectField } from '../../components/ui/SelectField';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { getAlertSeverityLabel, getAlertStatusLabel } from '../../constants/inverters';
import { ApiError, fetchApi } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { can } from '../../lib/operational';

type Alert = {
  id: string;
  title: string;
  description?: string | null;
  severity: string;
  status: string;
  ruleCode: string;
  occurredAt: string;
  plant?: { id: string; name: string };
  inverter?: { id: string; model?: string | null };
};

type Plant = { id: string; name: string };
type Inverter = { id: string; model?: string | null; plant?: { name: string } };

export default function AlertasPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Alert[] | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [inverters, setInverters] = useState<Inverter[]>([]);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [plantId, setPlantId] = useState('');
  const [inverterId, setInverterId] = useState('');
  const canResolve = can(user, 'ALERTS_RESOLVE');

  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (severity) query.set('severity', severity);
    if (plantId) query.set('plantId', plantId);
    if (inverterId) query.set('inverterId', inverterId);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const alerts = await fetchApi<Alert[]>(`/alerts${suffix}`);
    setRows(alerts);
  }, [status, severity, plantId, inverterId]);

  useEffect(() => {
    fetchApi<Plant[]>('/plants').then(setPlants).catch(() => undefined);
    fetchApi<Inverter[]>('/inverters').then(setInverters).catch(() => undefined);
  }, []);

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, [load]);

  async function act(id: string, action: 'acknowledge' | 'resolve') {
    setActionError('');
    try {
      await fetchApi(`/alerts/${id}/${action}`, {
        method: action === 'acknowledge' ? 'POST' : 'PATCH',
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o alerta.');
    }
  }

  return (
    <div className="shell">
      <PageHeader title="Alertas" description="Acompanhamento dos eventos operacionais das usinas." />
      {error ? <ErrorMessage message={error} /> : null}
      {actionError ? <ErrorMessage message={actionError} /> : null}
      <section className="panel">
        <div className="toolbar-filters">
          <SelectField
            id="alert-status"
            label="Status"
            value={status}
            placeholder="Todos"
            options={[
              { value: 'OPEN', label: 'Aberto' },
              { value: 'ACKNOWLEDGED', label: 'Reconhecido' },
              { value: 'RESOLVED', label: 'Resolvido' },
            ]}
            onChange={setStatus}
          />
          <SelectField
            id="alert-severity"
            label="Severidade"
            value={severity}
            placeholder="Todas"
            options={[
              { value: 'INFO', label: 'Informação' },
              { value: 'WARNING', label: 'Em atenção' },
              { value: 'CRITICAL', label: 'Crítico' },
            ]}
            onChange={setSeverity}
          />
          <SelectField
            id="alert-plant"
            label="Usina"
            value={plantId}
            placeholder="Todas"
            options={plants.map((plant) => ({ value: plant.id, label: plant.name }))}
            onChange={setPlantId}
          />
          <SelectField
            id="alert-inverter"
            label="Inversor"
            value={inverterId}
            placeholder="Todos"
            options={inverters.map((item) => ({
              value: item.id,
              label: item.model ? `${item.model} · ${item.plant?.name || item.id}` : item.id,
            }))}
            onChange={setInverterId}
          />
        </div>
      </section>
      {!error && !rows ? <LoadingState message="Carregando alertas..." /> : null}
      {rows ? (
        <section className="panel">
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'title',
                header: 'Alerta',
                render: (row) => <Link href={`/alertas/${row.id}`}>{row.title}</Link>,
              },
              { key: 'rule', header: 'Regra', render: (row) => row.ruleCode },
              { key: 'plant', header: 'Usina', render: (row) => row.plant?.name || '—' },
              { key: 'inverter', header: 'Inversor', render: (row) => row.inverter?.model || row.inverter?.id || '—' },
              {
                key: 'severity',
                header: 'Severidade',
                render: (row) => <StatusBadge label={getAlertSeverityLabel(row.severity)} status={row.severity} />,
              },
              { key: 'status', header: 'Estado', render: (row) => getAlertStatusLabel(row.status) },
              { key: 'when', header: 'Horário', render: (row) => formatDateTime(row.occurredAt) },
              {
                key: 'actions',
                header: 'Ações',
                render: (row) => (
                  canResolve && row.status !== 'RESOLVED' ? (
                    <span className="toolbar-filters">
                      {row.status === 'OPEN' ? (
                        <Button variant="secondary" type="button" onClick={() => void act(row.id, 'acknowledge')}>
                          Reconhecer
                        </Button>
                      ) : null}
                      <Button variant="ghost" type="button" onClick={() => void act(row.id, 'resolve')}>
                        Resolver
                      </Button>
                    </span>
                  ) : null
                ),
              },
            ]}
            empty={<EmptyState title="Nenhum alerta registrado" description="Os eventos operacionais aparecerão nesta lista." />}
          />
        </section>
      ) : null}
    </div>
  );
}
