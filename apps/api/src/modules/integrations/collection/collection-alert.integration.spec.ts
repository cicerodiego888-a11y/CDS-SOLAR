import { IntegrationEngine } from '../integration.engine';
import { CollectionError } from './collection.errors';
import { IntegrationCollectionService } from './integration.collection.service';

function inverter() {
  return {
    id: 'i1',
    plantId: 'p1',
    model: 'INV-A',
    manufacturer: 'AUXSOL',
    manufacturerRef: { code: 'AUXSOL' },
    serialNumber: 'SN1',
    externalId: 'ext-1',
    plant: { name: 'Usina Norte' },
    bindings: [{ id: 'b1', provider: 'AUXSOL', externalId: 'ext-1', lastSyncAt: null }],
  };
}

describe('Coleta → persistência → AlertEngine', () => {
  const prevPersist = process.env.AUXSOL_PERSIST_READINGS;
  const prevIds = process.env.AUXSOL_PERSIST_INVERTER_IDS;

  beforeEach(() => {
    process.env.AUXSOL_PERSIST_READINGS = 'true';
    process.env.AUXSOL_PERSIST_INVERTER_IDS = 'i1';
  });

  afterEach(() => {
    if (prevPersist === undefined) delete process.env.AUXSOL_PERSIST_READINGS;
    else process.env.AUXSOL_PERSIST_READINGS = prevPersist;
    if (prevIds === undefined) delete process.env.AUXSOL_PERSIST_INVERTER_IDS;
    else process.env.AUXSOL_PERSIST_INVERTER_IDS = prevIds;
  });

  it('leitura válida OFFLINE cria avaliação de alerta', async () => {
    const evaluateAfterCollection = jest.fn().mockResolvedValue([{ id: 'alert-1' }]);
    const prisma = {
      inverter: { findUnique: jest.fn().mockResolvedValue(inverter()) },
      integrationBinding: { update: jest.fn().mockResolvedValue({}) },
    };
    const persistence = { persist: jest.fn().mockResolvedValue({ persisted: 1, skipped: 0, valid: 1 }) };
    const adapter = {
      provider: 'AUXSOL',
      capabilities: () => ['collect'],
      runtimeState: () => ({ mode: 'live', persistable: true, available: true }),
      collect: async () => [{
        collectedAt: new Date('2026-09-05T12:00:00.000Z'),
        communicationOk: false,
        status: 'OFFLINE',
        powerKw: 0,
      }],
    };
    const service = new IntegrationCollectionService(
      prisma as never,
      persistence as never,
      { evaluateAfterCollection } as never,
    ).useEngine(new IntegrationEngine().register(adapter as never));

    const result = await service.collectInverter('i1');
    expect(result.persisted).toBe(1);
    expect(evaluateAfterCollection).toHaveBeenCalledWith(expect.objectContaining({
      inverterId: 'i1',
      status: 'OFFLINE',
      readingValid: true,
      collectability: 'COLLECTABLE',
    }));
  });

  it('leitura inválida não aciona o motor de alertas', async () => {
    const evaluateAfterCollection = jest.fn();
    const prisma = {
      inverter: { findUnique: jest.fn().mockResolvedValue(inverter()) },
      integrationBinding: { update: jest.fn().mockResolvedValue({}) },
    };
    const persistence = { persist: jest.fn().mockResolvedValue({ persisted: 0, skipped: 1, valid: 0 }) };
    const adapter = {
      provider: 'AUXSOL',
      capabilities: () => ['collect'],
      runtimeState: () => ({ mode: 'live', persistable: true, available: true }),
      collect: async () => [{ collectedAt: new Date('invalid'), status: 'OFFLINE', powerKw: Number.NaN }],
    };
    const service = new IntegrationCollectionService(
      prisma as never,
      persistence as never,
      { evaluateAfterCollection } as never,
    ).useEngine(new IntegrationEngine().register(adapter as never));

    await service.collectInverter('i1');
    expect(evaluateAfterCollection).not.toHaveBeenCalled();
  });

  it('AUXSOL BLOCKED não gera alerta falso', async () => {
    const evaluateAfterCollection = jest.fn();
    const prisma = {
      inverter: { findUnique: jest.fn().mockResolvedValue(inverter()) },
      integrationBinding: { update: jest.fn().mockResolvedValue({}) },
    };
    const adapter = {
      provider: 'AUXSOL',
      capabilities: () => ['collect'],
      runtimeState: () => ({ mode: 'blocked', persistable: false, available: true }),
      collect: async () => [],
    };
    const service = new IntegrationCollectionService(
      prisma as never,
      { persist: jest.fn() } as never,
      { evaluateAfterCollection } as never,
    ).useEngine(new IntegrationEngine().register(adapter as never));

    await expect(service.collectInverter('i1')).rejects.toBeInstanceOf(CollectionError);
    expect(evaluateAfterCollection).not.toHaveBeenCalled();
  });

  it('Opção A: live válida sem persistência atualiza lastSyncAt e NÃO avalia alertas', async () => {
    const evaluateAfterCollection = jest.fn().mockResolvedValue([]);
    const prisma = {
      inverter: { findUnique: jest.fn().mockResolvedValue(inverter()) },
      integrationBinding: { update: jest.fn().mockResolvedValue({}) },
    };
    const collectedAt = new Date('2026-11-08T02:55:00.000Z');
    const adapter = {
      provider: 'AUXSOL',
      capabilities: () => ['collect'],
      runtimeState: () => ({ mode: 'live', persistable: false, available: true }),
      collect: async () => [{
        collectedAt,
        communicationOk: true,
        status: 'ONLINE',
        powerKw: 0,
        energyTodayKwh: 69.32,
      }],
    };
    const persistence = { persist: jest.fn() };
    const service = new IntegrationCollectionService(
      prisma as never,
      persistence as never,
      { evaluateAfterCollection } as never,
    ).useEngine(new IntegrationEngine().register(adapter as never));

    const result = await service.collectInverter('i1');
    expect(result.persisted).toBe(0);
    expect(persistence.persist).not.toHaveBeenCalled();
    expect(evaluateAfterCollection).not.toHaveBeenCalled();
    expect(prisma.integrationBinding.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastSyncAt: collectedAt }),
    }));
  });
});
