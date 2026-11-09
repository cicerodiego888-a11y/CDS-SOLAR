/**
 * Testes obrigatórios B7-MONITORAMENTO-COERENCIA-03 — alertas.
 */
import { IntegrationEngine } from '../integrations/integration.engine';
import { IntegrationCollectionService } from '../integrations/collection/integration.collection.service';
import { MonitoringAlertService } from './alert.engine';
import { ALERT_ACTOR_SYSTEM, ALERT_RULE, alertFingerprint } from './alert.constants';
import { AlertEvaluationContext } from './alert.types';
import { NoRecentReadingRule } from './rules/no-recent-reading.rule';

type StoredAlert = {
  id: string;
  fingerprint: string;
  status: string;
  ruleCode: string;
  inverterId: string;
  plantId: string;
  title: string;
  resolvedBy?: string;
  resolutionType?: string;
};

function context(overrides: Partial<AlertEvaluationContext> = {}): AlertEvaluationContext {
  return {
    inverterId: 'inv-a',
    inverterName: 'ASN',
    plantId: 'plant-1',
    plantName: 'Usina',
    collectability: 'COLLECTABLE',
    readingValid: true,
    status: 'ONLINE',
    now: new Date('2026-11-08T03:00:00.000Z'),
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

function seedAlert(status: string, ruleCode = ALERT_RULE.NO_RECENT_READING): StoredAlert {
  return {
    id: `alert-${status.toLowerCase()}`,
    fingerprint: alertFingerprint(ruleCode, 'inv-a'),
    status,
    ruleCode,
    inverterId: 'inv-a',
    plantId: 'plant-1',
    title: ruleCode,
  };
}

function inverterRow() {
  return {
    id: 'inv-a',
    plantId: 'plant-1',
    model: 'ASN',
    manufacturer: 'AUXSOL',
    manufacturerRef: { code: 'AUXSOL' },
    serialNumber: 'SN1',
    externalId: 'ext-1',
    plant: { name: 'Usina' },
    bindings: [{ id: 'b1', provider: 'AUXSOL', externalId: 'ext-1', lastSyncAt: null }],
  };
}

describe('COERENCIA-03 — alertas', () => {
  it('1) coleta live persist OFF não resolve alerta OPEN', async () => {
    const evaluateAfterCollection = jest.fn();
    const prisma = {
      inverter: { findUnique: jest.fn().mockResolvedValue(inverterRow()) },
      integrationBinding: { update: jest.fn().mockResolvedValue({}) },
    };
    const collectedAt = new Date('2026-11-08T02:55:00.000Z');
    const service = new IntegrationCollectionService(
      prisma as never,
      { persist: jest.fn() } as never,
      { evaluateAfterCollection } as never,
    ).useEngine(new IntegrationEngine().register({
      provider: 'AUXSOL',
      capabilities: () => ['collect'],
      runtimeState: () => ({ mode: 'live', persistable: false, available: true }),
      collect: async () => [{ collectedAt, communicationOk: true, status: 'ONLINE', powerKw: 0 }],
    } as never));

    await service.collectInverter('inv-a');
    expect(evaluateAfterCollection).not.toHaveBeenCalled();
  });

  it('2) coleta live persist OFF não resolve alerta ACKNOWLEDGED (sem evaluateAfterCollection)', async () => {
    const evaluateAfterCollection = jest.fn();
    const prisma = {
      inverter: { findUnique: jest.fn().mockResolvedValue(inverterRow()) },
      integrationBinding: { update: jest.fn().mockResolvedValue({}) },
    };
    const service = new IntegrationCollectionService(
      prisma as never,
      { persist: jest.fn() } as never,
      { evaluateAfterCollection } as never,
    ).useEngine(new IntegrationEngine().register({
      provider: 'AUXSOL',
      capabilities: () => ['collect'],
      runtimeState: () => ({ mode: 'live', persistable: false, available: true }),
      collect: async () => [{
        collectedAt: new Date('2026-11-08T02:55:00.000Z'),
        communicationOk: true,
        status: 'ONLINE',
        powerKw: 1,
      }],
    } as never));

    await service.collectInverter('inv-a');
    expect(evaluateAfterCollection).not.toHaveBeenCalled();
  });

  it('3) lastSyncAt recente impede falso positivo de ausência (skip/open)', () => {
    const decision = new NoRecentReadingRule().evaluate(context({
      lastReadingAt: new Date('2026-11-08T02:55:00.000Z'),
      persistedLastReadingAt: null,
    }));
    expect(decision).toEqual({ action: 'skip' });
  });

  it('4) lastSyncAt recente não resolve alerta existente sozinho', async () => {
    const prisma = createPrisma([seedAlert('OPEN')]);
    const engine = new MonitoringAlertService(prisma as never);
    await engine.evaluateAbsence(context({
      lastReadingAt: new Date('2026-11-08T02:55:00.000Z'),
      persistedLastReadingAt: null,
    }));
    expect(prisma.alerts[0].status).toBe('OPEN');
    expect(prisma.alerts[0].resolutionType).toBeUndefined();
  });

  it('5) leitura persistida recente preserva resolução automática', async () => {
    const prisma = createPrisma([seedAlert('OPEN')]);
    const engine = new MonitoringAlertService(prisma as never);
    const recent = new Date('2026-11-08T02:55:00.000Z');
    await engine.evaluateAbsence(context({
      lastReadingAt: recent,
      persistedLastReadingAt: recent,
    }));
    expect(prisma.alerts[0].status).toBe('RESOLVED');
    expect(prisma.alerts[0].resolutionType).toBe('AUTOMATIC');
    expect(prisma.alerts[0].resolvedBy).toBe(ALERT_ACTOR_SYSTEM);
  });

  it('6) leitura ausente/antiga continua permitindo abertura legítima', async () => {
    const prisma = createPrisma();
    const engine = new MonitoringAlertService(prisma as never);
    await engine.evaluateAbsence(context({
      lastReadingAt: new Date('2026-11-08T01:00:00.000Z'),
      persistedLastReadingAt: new Date('2026-11-08T01:00:00.000Z'),
    }));
    expect(prisma.alerts).toHaveLength(1);
    expect(prisma.alerts[0].ruleCode).toBe(ALERT_RULE.NO_RECENT_READING);
    expect(prisma.alerts[0].status).toBe('OPEN');
  });

  it('7) alertas de outros tipos não sofrem alterações na ausência', async () => {
    const offline = seedAlert('OPEN', ALERT_RULE.INVERTER_OFFLINE);
    offline.fingerprint = alertFingerprint(ALERT_RULE.INVERTER_OFFLINE, 'inv-a');
    const prisma = createPrisma([offline]);
    const engine = new MonitoringAlertService(prisma as never);
    await engine.evaluateAbsence(context({
      lastReadingAt: new Date('2026-11-08T02:55:00.000Z'),
      persistedLastReadingAt: new Date('2026-11-08T02:55:00.000Z'),
    }));
    expect(prisma.alerts).toHaveLength(1);
    expect(prisma.alerts[0].ruleCode).toBe(ALERT_RULE.INVERTER_OFFLINE);
    expect(prisma.alerts[0].status).toBe('OPEN');
  });

  it('contrato persistido: evaluateAfterCollection ainda resolve NO_RECENT', async () => {
    const prisma = createPrisma([seedAlert('OPEN')]);
    const engine = new MonitoringAlertService(prisma as never);
    await engine.evaluateAfterCollection(context({
      readingValid: true,
      collectedAt: new Date('2026-11-08T02:55:00.000Z'),
      status: 'ONLINE',
    }));
    expect(prisma.alerts[0].status).toBe('RESOLVED');
  });
});
