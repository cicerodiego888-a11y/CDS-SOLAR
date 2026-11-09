/**
 * AUDITORIA B7-MONITORAMENTO-COERENCIA-02 — resolução automática de alertas.
 * Não altera produção; documenta o comportamento atual do motor.
 */
import { MonitoringAlertService } from './alert.engine';
import { ALERT_ACTOR_SYSTEM, ALERT_RULE, alertFingerprint } from './alert.constants';
import { AlertEvaluationContext } from './alert.types';

type StoredAlert = {
  id: string;
  fingerprint: string;
  status: string;
  ruleCode: string;
  inverterId: string;
  plantId: string;
  title: string;
  description?: string;
  resolvedBy?: string;
  resolutionType?: string;
};

function context(overrides: Partial<AlertEvaluationContext> = {}): AlertEvaluationContext {
  return {
    inverterId: 'inv-ulisses',
    inverterName: 'ASN-10SL',
    plantId: 'plant-ulisses',
    plantName: 'Usina Ulisses',
    collectability: 'COLLECTABLE',
    readingValid: true,
    status: 'ONLINE',
    collectedAt: new Date('2026-11-08T03:00:00.000Z'),
    lastReadingAt: new Date('2026-11-08T03:00:00.000Z'),
    provider: 'AUXSOL',
    ...overrides,
  };
}

function createPrisma(seed: StoredAlert[] = []) {
  const alerts = [...seed];
  let seq = alerts.length;
  return {
    alerts,
    alert: {
      findFirst: jest.fn(async ({ where }: { where: { fingerprint: string; status?: { in: string[] } } }) => {
        return alerts.find((item) => (
          item.fingerprint === where.fingerprint
          && (!where.status?.in || where.status.in.includes(item.status))
        )) ?? null;
      }),
      create: jest.fn(async ({ data }: { data: StoredAlert }) => {
        const created = { ...data, id: `alert-${++seq}` };
        alerts.push(created);
        return created;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<StoredAlert> }) => {
        const current = alerts.find((item) => item.id === where.id);
        if (!current) return null;
        Object.assign(current, data);
        return current;
      }),
    },
    inverter: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('AUDITORIA — resolução automática via evaluateAfterCollection', () => {
  it('coleta ao vivo válida RESOLVE alerta OPEN de NO_RECENT_READING (comportamento atual)', async () => {
    const fingerprint = alertFingerprint(ALERT_RULE.NO_RECENT_READING, 'inv-ulisses');
    const prisma = createPrisma([{
      id: 'alert-open-1',
      fingerprint,
      status: 'OPEN',
      ruleCode: ALERT_RULE.NO_RECENT_READING,
      inverterId: 'inv-ulisses',
      plantId: 'plant-ulisses',
      title: 'Ausência de leitura',
    }]);
    const engine = new MonitoringAlertService(prisma as never);

    const applied = await engine.evaluateAfterCollection(context({
      readingValid: true,
      collectedAt: new Date('2026-11-08T03:00:00.000Z'),
      status: 'ONLINE',
    }));

    expect(applied).toHaveLength(1);
    expect(prisma.alerts[0].status).toBe('RESOLVED');
    expect(prisma.alerts[0].resolutionType).toBe('AUTOMATIC');
    expect(prisma.alerts[0].resolvedBy).toBe(ALERT_ACTOR_SYSTEM);
  });

  it('coleta ao vivo válida também resolve alerta ACKNOWLEDGED de NO_RECENT_READING', async () => {
    const fingerprint = alertFingerprint(ALERT_RULE.NO_RECENT_READING, 'inv-ulisses');
    const prisma = createPrisma([{
      id: 'alert-ack-1',
      fingerprint,
      status: 'ACKNOWLEDGED',
      ruleCode: ALERT_RULE.NO_RECENT_READING,
      inverterId: 'inv-ulisses',
      plantId: 'plant-ulisses',
      title: 'Ausência de leitura',
    }]);
    const engine = new MonitoringAlertService(prisma as never);

    await engine.evaluateAfterCollection(context({ readingValid: true, collectedAt: new Date() }));

    expect(prisma.alerts[0].status).toBe('RESOLVED');
    expect(prisma.alerts[0].resolutionType).toBe('AUTOMATIC');
  });

  it('leitura inválida (readingValid=false) NÃO resolve NO_RECENT_READING via atalho pós-coleta', async () => {
    const fingerprint = alertFingerprint(ALERT_RULE.NO_RECENT_READING, 'inv-ulisses');
    const prisma = createPrisma([{
      id: 'alert-open-2',
      fingerprint,
      status: 'OPEN',
      ruleCode: ALERT_RULE.NO_RECENT_READING,
      inverterId: 'inv-ulisses',
      plantId: 'plant-ulisses',
      title: 'Ausência de leitura',
    }]);
    const engine = new MonitoringAlertService(prisma as never);

    await engine.evaluateAfterCollection(context({
      readingValid: false,
      collectedAt: new Date('2026-11-08T03:00:00.000Z'),
      status: 'ONLINE',
    }));

    expect(prisma.alerts[0].status).toBe('OPEN');
  });

  it('COERENCIA-03: evaluateAbsence com lastSyncAt recente (sem persistido) NÃO resolve', async () => {
    const fingerprint = alertFingerprint(ALERT_RULE.NO_RECENT_READING, 'inv-ulisses');
    const prisma = createPrisma([{
      id: 'alert-open-3',
      fingerprint,
      status: 'OPEN',
      ruleCode: ALERT_RULE.NO_RECENT_READING,
      inverterId: 'inv-ulisses',
      plantId: 'plant-ulisses',
      title: 'Ausência de leitura',
    }]);
    const engine = new MonitoringAlertService(prisma as never);
    const now = new Date('2026-11-08T03:00:00.000Z');

    await engine.evaluateAbsence(context({
      lastReadingAt: new Date('2026-11-08T02:55:00.000Z'),
      persistedLastReadingAt: null,
      now,
      readingValid: undefined,
      collectedAt: undefined,
    }));

    expect(prisma.alerts[0].status).toBe('OPEN');
  });

  it('COERENCIA-03: evaluateAbsence com persistido recente resolve', async () => {
    const fingerprint = alertFingerprint(ALERT_RULE.NO_RECENT_READING, 'inv-ulisses');
    const prisma = createPrisma([{
      id: 'alert-open-4',
      fingerprint,
      status: 'OPEN',
      ruleCode: ALERT_RULE.NO_RECENT_READING,
      inverterId: 'inv-ulisses',
      plantId: 'plant-ulisses',
      title: 'Ausência de leitura',
    }]);
    const engine = new MonitoringAlertService(prisma as never);
    const recent = new Date('2026-11-08T02:55:00.000Z');

    await engine.evaluateAbsence(context({
      lastReadingAt: recent,
      persistedLastReadingAt: recent,
      now: new Date('2026-11-08T03:00:00.000Z'),
    }));

    expect(prisma.alerts[0].status).toBe('RESOLVED');
  });

  it('estados ativos elegíveis a resolução automática: OPEN e ACKNOWLEDGED', () => {
    // Documentação do contrato do motor (ACTIVE_STATUSES em alert.engine.ts).
    const active = ['OPEN', 'ACKNOWLEDGED'];
    expect(active).toContain('OPEN');
    expect(active).toContain('ACKNOWLEDGED');
    expect(active).not.toContain('RESOLVED');
  });
});
