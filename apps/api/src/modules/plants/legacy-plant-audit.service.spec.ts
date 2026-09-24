import { LegacyPlantAuditService } from './legacy-plant-audit.service';

describe('LegacyPlantAuditService', () => {
  let service: LegacyPlantAuditService;
  let prisma: {
    plant: { findMany: jest.Mock };
    consumerUnit: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      plant: { findMany: jest.fn() },
      consumerUnit: { findMany: jest.fn() },
    };
    service = new LegacyPlantAuditService(prisma as never);
  });

  it('classifica Plants legadas sem converter automaticamente', async () => {
    prisma.plant.findMany.mockResolvedValue([
      {
        id: 'p-formal',
        name: 'Formal',
        customerId: 'c1',
        consumerUnit: '1',
        distributor: 'Equatorial',
        consumerUnitId: 'u1',
        customer: { id: 'c1', name: 'A', consumerId: 'cons1' },
      },
      {
        id: 'p-legacy-uc',
        name: 'Legacy UC',
        customerId: 'c2',
        consumerUnit: '11230436',
        distributor: null,
        consumerUnitId: null,
        customer: { id: 'c2', name: 'B', consumerId: null },
      },
      {
        id: 'p-legacy-dist',
        name: 'Legacy Dist',
        customerId: 'c3',
        consumerUnit: null,
        distributor: 'ENEL',
        consumerUnitId: null,
        customer: { id: 'c3', name: 'C', consumerId: 'cons3' },
      },
      {
        id: 'p-empty',
        name: 'Empty',
        customerId: 'c4',
        consumerUnit: null,
        distributor: null,
        consumerUnitId: null,
        customer: { id: 'c4', name: 'D', consumerId: null },
      },
      {
        id: 'p-safe',
        name: 'Safe',
        customerId: 'c5',
        consumerUnit: '11230436',
        distributor: 'Equatorial',
        consumerUnitId: null,
        customer: { id: 'c5', name: 'Ulisses', consumerId: 'cons5' },
      },
      {
        id: 'p-ambiguous',
        name: 'Ambiguous',
        customerId: 'c6',
        consumerUnit: '999',
        distributor: 'X',
        consumerUnitId: null,
        customer: { id: 'c6', name: 'E', consumerId: 'cons6' },
      },
    ]);
    prisma.consumerUnit.findMany.mockResolvedValue([
      {
        id: 'u-safe',
        number: '11230436',
        consumerId: 'cons5',
        distributor: { name: 'Equatorial', code: 'EQ' },
      },
    ]);

    const report = await service.buildReport();
    expect(report.totals.plants).toBe(6);
    expect(report.totals.withLegacyConsumerUnit).toBe(4);
    expect(report.totals.withLegacyDistributor).toBe(4);
    expect(report.totals.withoutFormalConsumerUnit).toBe(5);
    expect(report.totals.customerHasConsumer).toBe(4);
    expect(report.totals.SAFE_MATCH_CANDIDATE).toBe(1);
    expect(report.totals.HAS_FORMAL_LINK).toBe(1);
    expect(report.totals.LEGACY_UC_ONLY).toBe(1);
    expect(report.totals.LEGACY_DISTRIBUTOR_ONLY).toBe(1);
    expect(report.totals.NO_ENERGY_INFO).toBe(1);
    expect(report.totals.AMBIGUOUS_OR_INSUFFICIENT).toBe(1);
    expect(report.items.find((item) => item.plantId === 'p-safe')?.safeMatchConsumerUnitId).toBe('u-safe');
    expect(report.items.every((item) => item.category !== undefined)).toBe(true);
  });
});
