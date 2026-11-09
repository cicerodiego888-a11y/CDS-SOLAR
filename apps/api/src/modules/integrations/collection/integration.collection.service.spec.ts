import { NotFoundException } from '@nestjs/common';
import { IntegrationEngine } from '../integration.engine';
import { CollectionError } from './collection.errors';
import { IntegrationCollectionService } from './integration.collection.service';

function inverter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    plantId: 'p1',
    manufacturer: 'AUXSOL',
    manufacturerRef: { code: 'AUXSOL' },
    serialNumber: 'SN1',
    externalId: 'ext-1',
    bindings: [{ id: 'b1', provider: 'AUXSOL', externalId: 'ext-1', lastSyncAt: null }],
    ...overrides,
  };
}

function adapter(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'AUXSOL',
    capabilities: () => ['testConnection', 'collect'],
    runtimeState: () => ({ mode: 'blocked', persistable: false, available: true }),
    testConnection: async () => ({ ok: false, supported: false, mode: 'blocked', message: 'blocked' }),
    collect: async () => [],
    ...overrides,
  };
}

describe('IntegrationCollectionService', () => {
  const prevPersist = process.env.AUXSOL_PERSIST_READINGS;
  const prevIds = process.env.AUXSOL_PERSIST_INVERTER_IDS;

  beforeEach(() => {
    // Escopo de teste: allowlist inclui o inversor mock 'i1'.
    process.env.AUXSOL_PERSIST_READINGS = 'true';
    process.env.AUXSOL_PERSIST_INVERTER_IDS = 'i1';
  });

  afterEach(() => {
    if (prevPersist === undefined) delete process.env.AUXSOL_PERSIST_READINGS;
    else process.env.AUXSOL_PERSIST_READINGS = prevPersist;
    if (prevIds === undefined) delete process.env.AUXSOL_PERSIST_INVERTER_IDS;
    else process.env.AUXSOL_PERSIST_INVERTER_IDS = prevIds;
  });

  function setup(adapterImpl: ReturnType<typeof adapter>, inverterValue: unknown = inverter()) {
    const prisma = {
      inverter: { findUnique: jest.fn().mockResolvedValue(inverterValue) },
      integrationBinding: { update: jest.fn().mockResolvedValue({}) },
    };
    const persistence = { persist: jest.fn().mockResolvedValue({ persisted: 1, skipped: 0, valid: 1 }) };
    const engine = new IntegrationEngine().register(adapterImpl as never);
    const service = new IntegrationCollectionService(prisma as never, persistence as never).useEngine(engine);
    return { service, prisma, persistence };
  }

  it('retorna 404 quando o inversor não existe', async () => {
    const { service } = setup(adapter(), null);
    await expect(service.collectInverter('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bloqueia inversor sem binding', async () => {
    const { service } = setup(adapter(), inverter({ bindings: [] }));
    await expect(service.collectInverter('i1')).rejects.toMatchObject({ code: 'INTEGRATION_NOT_CONFIGURED' });
  });

  it('bloqueia fabricante sem adapter disponível', async () => {
    const { service } = setup(adapter({
      provider: 'DEYE',
      runtimeState: () => ({ mode: 'blocked', persistable: false, available: false }),
    }), inverter({ manufacturer: 'DEYE', manufacturerRef: { code: 'DEYE' }, bindings: [{ id: 'b2', provider: 'DEYE' }] }));
    await expect(service.collectInverter('i1')).rejects.toMatchObject({ code: 'INTEGRATION_NOT_SUPPORTED' });
  });

  it('trata AUXSOL blocked sem persistir', async () => {
    const { service, persistence } = setup(adapter());
    await expect(service.collectInverter('i1')).rejects.toBeInstanceOf(CollectionError);
    expect(persistence.persist).not.toHaveBeenCalled();
  });

  it('executa mock sem persistir e registra lastSyncAt da leitura válida', async () => {
    const collectedAt = new Date('2026-09-05T12:00:00.000Z');
    const { service, persistence, prisma } = setup(adapter({
      runtimeState: () => ({ mode: 'mock', persistable: false, available: true }),
      collect: async () => [{
        collectedAt,
        communicationOk: true,
        powerKw: 1,
      }],
    }));
    const result = await service.collectInverter('i1');
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('mock');
    expect(result.persisted).toBe(0);
    expect(result.lastSyncAt).toBe(collectedAt.toISOString());
    expect(result.liveReading?.available).toBe(true);
    expect(result.liveReading?.powerKw).toBe(1);
    expect(result.liveReading?.persisted).toBe(false);
    expect(persistence.persist).not.toHaveBeenCalled();
    expect(prisma.integrationBinding.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastSyncAt: collectedAt }),
    }));
  });

  it('persiste coleta live válida e atualiza lastSyncAt', async () => {
    const { service, persistence } = setup(adapter({
      runtimeState: () => ({ mode: 'live', persistable: true, available: true }),
      collect: async () => [{
        collectedAt: new Date('2026-09-05T12:00:00.000Z'),
        communicationOk: true,
        powerKw: 1.2,
        energyTodayKwh: 3,
      }],
    }));
    const result = await service.collectInverter('i1');
    expect(result.ok).toBe(true);
    expect(result.persisted).toBe(1);
    expect(result.lastSyncAt).toBeTruthy();
    expect(result.liveReading?.available).toBe(true);
    expect(result.liveReading?.energyTodayKwh).toBe(3);
    expect(persistence.persist).toHaveBeenCalled();
  });

  it('live sem persistência devolve liveReading e não grava', async () => {
    const { service, persistence } = setup(adapter({
      runtimeState: () => ({ mode: 'live', persistable: false, available: true }),
      collect: async () => [{
        collectedAt: new Date('2026-11-07T20:29:39.000Z'),
        communicationOk: true,
        powerKw: 0,
        energyTodayKwh: 69.32,
        energyMonthKwh: 457.53,
        energyTotalKwh: 5768.11,
      }],
    }));
    const result = await service.collectInverter('i1');
    expect(result.ok).toBe(true);
    expect(result.persisted).toBe(0);
    expect(result.liveReading?.available).toBe(true);
    expect(result.liveReading?.powerKw).toBe(0);
    expect(result.liveReading?.energyTodayKwh).toBe(69.32);
    expect(result.message).toMatch(/Persistência desabilitada/i);
    expect(persistence.persist).not.toHaveBeenCalled();
  });

  it('B) potência 0 é válida e grava quando no escopo', async () => {
    const { service, persistence } = setup(adapter({
      runtimeState: () => ({ mode: 'live', persistable: true, available: true }),
      collect: async () => [{
        collectedAt: new Date('2026-11-08T15:00:00.000Z'),
        communicationOk: true,
        status: 'ONLINE',
        powerKw: 0,
        energyTodayKwh: 12.5,
      }],
    }));
    const result = await service.collectInverter('i1');
    expect(result.persisted).toBe(1);
    expect(result.liveReading?.powerKw).toBe(0);
    expect(persistence.persist).toHaveBeenCalled();
  });

  it('H) inversor fora da allowlist não grava mesmo com persistable=true', async () => {
    process.env.AUXSOL_PERSIST_INVERTER_IDS = 'cmw76di320001tyys55mvm5ex';
    const { service, persistence } = setup(adapter({
      runtimeState: () => ({ mode: 'live', persistable: true, available: true }),
      collect: async () => [{
        collectedAt: new Date('2026-11-08T15:00:00.000Z'),
        communicationOk: true,
        powerKw: 1,
      }],
    }));
    const result = await service.collectInverter('i1');
    expect(result.persisted).toBe(0);
    expect(persistence.persist).not.toHaveBeenCalled();
    expect(result.liveReading?.available).toBe(true);
  });

  it('registra coleta sem dados', async () => {
    const { service } = setup(adapter({
      runtimeState: () => ({ mode: 'live', persistable: true, available: true }),
      collect: async () => [],
    }));
    const result = await service.collectInverter('i1');
    expect(result.ok).toBe(true);
    expect(result.readings).toBe(0);
    expect(result.message).toBe('Coleta realizada sem dados.');
    expect(result.liveReading?.available).toBe(false);
    expect(result.liveReading?.energyTodayKwh).toBeNull();
  });

  it('atualiza lastError quando o adapter falha', async () => {
    const { service, prisma } = setup(adapter({
      runtimeState: () => ({ mode: 'live', persistable: true, available: true }),
      collect: async () => { throw new Error('timeout'); },
    }));
    await expect(service.collectInverter('i1')).rejects.toMatchObject({ code: 'COLLECTION_FAILED' });
    expect(prisma.integrationBinding.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastErrorAt: expect.any(Date) }),
    }));
  });

  it('impede coleta concorrente no mesmo processo', async () => {
    let release!: () => void;
    const hang = new Promise<never>((_resolve, _reject) => {
      release = () => _reject(new Error('stop'));
    });
    const { service } = setup(adapter({
      runtimeState: () => ({ mode: 'live', persistable: true, available: true }),
      collect: async () => hang as never,
    }));
    const first = service.collectInverter('i1');
    await Promise.resolve();
    await expect(service.collectInverter('i1')).rejects.toMatchObject({ code: 'CONCURRENT_COLLECTION' });
    release();
    await first.catch(() => undefined);
  });
});
