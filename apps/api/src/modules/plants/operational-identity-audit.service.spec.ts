import { OperationalIdentityAuditService } from './operational-identity-audit.service';

describe('OperationalIdentityAuditService', () => {
  let service: OperationalIdentityAuditService;
  let prisma: {
    inverter: { findMany: jest.Mock };
    equipment: { findMany: jest.Mock };
    integrationBinding: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      inverter: { findMany: jest.fn() },
      equipment: { findMany: jest.fn() },
      integrationBinding: { findMany: jest.fn() },
    };
    service = new OperationalIdentityAuditService(prisma as never);
  });

  it('classifica lacunas sem inventar IDs externos', async () => {
    prisma.inverter.findMany.mockResolvedValue([
      {
        id: 'i-jose',
        plantId: 'p1',
        manufacturerId: 'm1',
        manufacturer: 'AUXSOL',
        serialNumber: 'ASN-10SL2508230101',
        model: 'ASN-10SL',
        manufacturerRef: { code: 'AUXSOL' },
        bindings: [],
        plant: { id: 'p1', name: 'Usina fotovoltaica do José' },
      },
      {
        id: 'i-no-serial',
        plantId: 'p2',
        manufacturerId: null,
        manufacturer: 'X',
        serialNumber: null,
        model: 'Y',
        manufacturerRef: null,
        bindings: [],
        plant: { id: 'p2', name: 'Plant B' },
      },
    ]);
    prisma.equipment.findMany.mockResolvedValue([
      {
        id: 'g1',
        type: 'GATEWAY',
        serialNumber: 'A012509010791620',
        manufacturerName: 'AUXSOL',
        inverterId: null,
        plant: { id: 'p1', name: 'UJosé' },
        inverter: null,
      },
    ]);
    prisma.integrationBinding.findMany.mockResolvedValue([
      { id: 'b1', provider: 'AUXSOL', externalId: null, externalMeta: null, inverterId: 'i-jose', inverter: { id: 'i-jose' } },
      {
        id: 'b2',
        provider: 'AUXSOL',
        externalId: 'dup-1',
        externalMeta: { plantId: 'p' },
        inverterId: 'i-a',
        inverter: { id: 'i-a' },
      },
      {
        id: 'b3',
        provider: 'AUXSOL',
        externalId: 'dup-1',
        externalMeta: { provider: 'AUXSOL' },
        inverterId: 'i-b',
        inverter: { id: 'i-b' },
      },
    ]);

    const report = await service.buildReport();
    expect(report.totals.inverters).toBe(2);
    expect(report.totals.auxsolInvertersWithoutBinding).toBe(1);
    expect(report.totals.gatewaysWithoutInverterLink).toBe(1);
    expect(report.totals.bindingsWithoutExternalId).toBe(1);
    expect(report.totals.bindingsExternalMetaWithoutProvider).toBe(1);
    expect(report.totals.duplicateExternalIdsSameProvider).toBe(1);
    expect(report.totals.invertersWithoutSerial).toBe(1);
    expect(report.items.some((item) => item.category === 'AUXSOL_INVERTER_WITHOUT_BINDING')).toBe(true);
    expect(report.items.some((item) => item.category === 'DUPLICATE_EXTERNAL_ID_SAME_PROVIDER')).toBe(true);
    expect(report.items.every((item) => !String(item.detail).includes('invent'))).toBe(true);
  });
});
