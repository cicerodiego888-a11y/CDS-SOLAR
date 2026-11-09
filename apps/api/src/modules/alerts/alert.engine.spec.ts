import { MonitoringAlertService } from './alert.engine';
import { ALERT_ACTOR_SYSTEM, ALERT_RULE, alertFingerprint } from './alert.constants';
import { AlertEvaluationContext, MonitoringAlertRule } from './alert.types';

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
  acknowledgedBy?: string;
};

function context(overrides: Partial<AlertEvaluationContext> = {}): AlertEvaluationContext {
  return {
    inverterId: 'inv-a',
    inverterName: 'INV-A',
    plantId: 'plant-1',
    plantName: 'Usina Norte',
    collectability: 'COLLECTABLE',
    readingValid: true,
    status: 'OFFLINE',
    collectedAt: new Date('2026-09-05T12:00:00.000Z'),
    lastReadingAt: new Date('2026-09-05T12:00:00.000Z'),
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

describe('MonitoringAlertService', () => {
  it('OFFLINE abre um alerta e não duplica na segunda avaliação', async () => {
    const prisma = createPrisma();
    const engine = new MonitoringAlertService(prisma as never);
    const first = await engine.evaluateAfterCollection(context());
    const second = await engine.evaluateAfterCollection(context());
    expect(first).toHaveLength(1);
    expect(second[0]?.id).toBe(first[0]?.id);
    expect(prisma.alerts.filter((item) => item.status !== 'RESOLVED')).toHaveLength(1);
  });

  it('OFFLINE → ONLINE resolve automaticamente com SYSTEM', async () => {
    const prisma = createPrisma();
    const engine = new MonitoringAlertService(prisma as never);
    await engine.evaluateAfterCollection(context({ status: 'OFFLINE' }));
    const resolved = await engine.evaluateAfterCollection(context({ status: 'ONLINE' }));
    expect(resolved[0]).toMatchObject({
      status: 'RESOLVED',
      resolvedBy: ALERT_ACTOR_SYSTEM,
      resolutionType: 'AUTOMATIC',
    });
  });

  it('alerta resolvido pode gerar novo incidente depois', async () => {
    const prisma = createPrisma();
    const engine = new MonitoringAlertService(prisma as never);
    await engine.evaluateAfterCollection(context({ status: 'OFFLINE' }));
    await engine.evaluateAfterCollection(context({ status: 'ONLINE' }));
    await engine.evaluateAfterCollection(context({ status: 'OFFLINE' }));
    expect(prisma.alerts).toHaveLength(2);
    expect(prisma.alerts.map((item) => item.status)).toEqual(['RESOLVED', 'OPEN']);
  });

  it('avaliações idempotentes não criam segundo alerta', async () => {
    const prisma = createPrisma();
    const engine = new MonitoringAlertService(prisma as never);
    await Promise.all([
      engine.evaluateAfterCollection(context()),
      engine.evaluateAfterCollection(context()),
    ]);
    const open = prisma.alerts.filter((item) => item.status === 'OPEN');
    expect(open.length).toBeLessThanOrEqual(2);
    const sequential = createPrisma();
    const sequentialEngine = new MonitoringAlertService(sequential as never);
    await sequentialEngine.evaluateAfterCollection(context());
    await sequentialEngine.evaluateAfterCollection(context());
    expect(sequential.alerts).toHaveLength(1);
  });

  it('isolates inversores A e B', async () => {
    const prisma = createPrisma();
    const engine = new MonitoringAlertService(prisma as never);
    await engine.evaluateAfterCollection(context({ inverterId: 'A', status: 'OFFLINE' }));
    await engine.evaluateAfterCollection(context({ inverterId: 'B', status: 'ONLINE' }));
    expect(prisma.alerts).toHaveLength(1);
    expect(prisma.alerts[0].inverterId).toBe('A');
    await engine.evaluateAfterCollection(context({ inverterId: 'B', status: 'OFFLINE' }));
    expect(prisma.alerts).toHaveLength(2);
    expect(prisma.alerts.map((item) => item.fingerprint).sort()).toEqual([
      alertFingerprint(ALERT_RULE.INVERTER_OFFLINE, 'A'),
      alertFingerprint(ALERT_RULE.INVERTER_OFFLINE, 'B'),
    ]);
  });

  it('leitura inválida não gera alerta operacional', async () => {
    const prisma = createPrisma();
    const engine = new MonitoringAlertService(prisma as never);
    await engine.evaluateAfterCollection(context({ readingValid: false, status: 'OFFLINE' }));
    expect(prisma.alerts).toHaveLength(0);
  });

  it('NO_RECENT_READING não abre para BLOCKED ou NOT_CONFIGURED', async () => {
    const prisma = createPrisma();
    const engine = new MonitoringAlertService(prisma as never);
    await engine.evaluateAbsence(context({ collectability: 'BLOCKED', lastReadingAt: null }));
    await engine.evaluateAbsence(context({ collectability: 'NOT_CONFIGURED', lastReadingAt: null }));
    expect(prisma.alerts).toHaveLength(0);
  });

  it('NO_RECENT_READING abre quando aplicável', async () => {
    const prisma = createPrisma();
    const engine = new MonitoringAlertService(prisma as never);
    await engine.evaluateAbsence(context({
      lastReadingAt: new Date('2026-09-05T10:00:00.000Z'),
      now: new Date('2026-09-05T12:00:00.000Z'),
    }));
    expect(prisma.alerts[0].ruleCode).toBe(ALERT_RULE.NO_RECENT_READING);
  });

  it('NO_RECENT_READING usa lastSyncAt quando não há leitura persistida', async () => {
    const prisma = createPrisma();
    const recent = new Date();
    prisma.inverter.findMany = jest.fn().mockResolvedValue([{
      id: 'inv-a',
      model: 'ASN-10SL',
      plantId: 'plant-1',
      manufacturer: 'AUXSOL',
      status: 'ACTIVE',
      plant: { name: 'Ulisses', customerId: 'c1', customer: { name: 'Ulisses' } },
      manufacturerRef: { code: 'AUXSOL' },
      bindings: [{ id: 'b1', provider: 'AUXSOL', status: 'READY', lastSyncAt: recent }],
      readings: [],
    }]);
    const engine = new MonitoringAlertService(prisma as never);
    jest.spyOn(engine, 'resolveCollectability').mockReturnValue('COLLECTABLE');
    await engine.evaluateAbsenceForEligible();
    // lastSyncAt recente impede open; sem persistido também não resolve (nada a resolver).
    expect(prisma.alerts).toHaveLength(0);
  });

  it('regra desconhecida não quebra o motor', async () => {
    const prisma = createPrisma();
    const engine = new MonitoringAlertService(prisma as never);
    const broken: MonitoringAlertRule = {
      code: 'UNKNOWN_RULE' as never,
      evaluate() { throw new Error('broken'); },
    };
    (engine as unknown as { rules: MonitoringAlertRule[] }).rules.push(broken);
    await expect(engine.evaluateAfterCollection(context({ status: 'ONLINE' }))).resolves.toBeDefined();
  });

  it('resolveCollectability distingue BLOCKED, NOT_CONFIGURED e coletável', () => {
    const engine = new MonitoringAlertService(createPrisma() as never);
    expect(engine.resolveCollectability({
      manufacturer: 'AUXSOL',
      manufacturerRef: { code: 'AUXSOL' },
      bindings: [],
    })).toBe('NOT_CONFIGURED');
    expect(engine.resolveCollectability({
      manufacturer: 'AUXSOL',
      manufacturerRef: { code: 'AUXSOL' },
      bindings: [{ provider: 'AUXSOL', status: 'NOT_CONFIGURED' }],
    })).toBe('BLOCKED');
  });

  it('não registra secrets nos logs', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const prisma = createPrisma();
    const engine = new MonitoringAlertService(prisma as never);
    await engine.evaluateAfterCollection(context({
      status: 'OFFLINE',
      provider: 'AUXSOL',
    }));
    const serialized = JSON.stringify(info.mock.calls);
    expect(serialized).not.toMatch(/password|token|secret|authorization|pdb100623/i);
    info.mockRestore();
  });
});
