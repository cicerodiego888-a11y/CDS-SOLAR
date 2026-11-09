import { IntegrationBindingStatus } from '@prisma/client';
import {
  ensureUlissesLimaRegistration,
  ULISSES_LIMA_REGISTRATION,
} from './ulisses-lima.registration';

function baseFixture() {
  const customer = {
    id: 'cust-ulisses',
    name: 'Ulisses Lima',
    updatedAt: new Date('2026-09-22T15:16:38.637Z'),
    plants: [] as Array<Record<string, unknown>>,
  };
  const plant = {
    id: 'plant-ulisses',
    name: 'Ulisses Lima',
    customerId: customer.id,
    installedPowerKw: 10,
    distributor: 'Equatorial',
    consumerUnit: '003005596601',
    updatedAt: new Date('2026-09-22T15:17:22.351Z'),
    inverters: [] as Array<Record<string, unknown>>,
    equipment: [] as Array<Record<string, unknown>>,
  };
  const gateway = {
    id: 'eq-gw',
    plantId: plant.id,
    inverterId: null as string | null,
    type: 'GATEWAY',
    serialNumber: ULISSES_LIMA_REGISTRATION.gatewaySerial,
    manufacturerName: 'AUXSOL',
    model: null,
  };
  plant.equipment = [gateway];
  customer.plants = [plant];

  const manufacturer = {
    id: 'mfr-auxsol',
    code: 'AUXSOL',
  };

  return { customer, plant, gateway, manufacturer };
}

describe('ensureUlissesLimaRegistration (B7-ULISSES-01)', () => {
  it('identifica Customer e Plant existentes e cria inversor + binding idempotente', async () => {
    const { customer, plant, gateway, manufacturer } = baseFixture();
    let createdInverter: Record<string, unknown> | null = null;
    let createdBinding: Record<string, unknown> | null = null;
    let linkedGatewayInverterId: string | null = null;

    const tx = {
      inverter: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          createdInverter = {
            id: 'inv-ulisses',
            ...data,
          };
          return createdInverter;
        }),
        update: jest.fn(),
      },
      integrationBinding: {
        findFirst: jest.fn(async () => null),
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          createdBinding = {
            id: 'bind-1',
            status: IntegrationBindingStatus.READY,
            ...data,
          };
          return createdBinding;
        }),
        update: jest.fn(),
      },
      equipment: {
        update: jest.fn(async ({ data }: { data: { inverterId: string } }) => {
          linkedGatewayInverterId = data.inverterId;
          return { ...gateway, inverterId: data.inverterId };
        }),
      },
      plant: {
        findUnique: jest.fn(async () => plant),
      },
      customer: {
        findUnique: jest.fn(async () => customer),
        count: jest.fn(async () => 5),
      },
    };

    const prisma = {
      customer: {
        findFirst: jest.fn(async () => customer),
        count: jest.fn(async () => 5),
      },
      inverterManufacturer: {
        findUnique: jest.fn(async () => manufacturer),
      },
      integrationBinding: {
        findUnique: jest.fn(async () => null),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const report = await ensureUlissesLimaRegistration(prisma as never);

    expect(report.before.customerId).toBe('cust-ulisses');
    expect(report.before.plantId).toBe('plant-ulisses');
    expect(report.before.inverterId).toBeNull();
    expect(report.created.inverter).toBe(true);
    expect(report.created.binding).toBe(true);
    expect(report.associated.inverterToPlant).toBe(true);
    expect(report.associated.gatewayToInverter).toBe(true);
    expect(linkedGatewayInverterId).toBe('inv-ulisses');
    expect(createdInverter?.serialNumber).toBe(ULISSES_LIMA_REGISTRATION.inverterSerial);
    expect(createdInverter?.model).toBe('ASN-10SL');
    expect(createdInverter?.plantId).toBe(plant.id);
    expect(createdBinding?.provider).toBe('AUXSOL');
    expect(createdBinding?.externalId).toBe(String(ULISSES_LIMA_REGISTRATION.auxsolInverterId));
    expect(createdBinding?.secretRef).toBe('AUXSOL_APP_SECRET');
    expect(createdBinding?.externalMeta).toEqual({
      provider: 'AUXSOL',
      resourceType: 'INVERTER',
      plantId: ULISSES_LIMA_REGISTRATION.auxsolPlantId,
      inverterId: ULISSES_LIMA_REGISTRATION.auxsolInverterId,
      serialNumber: ULISSES_LIMA_REGISTRATION.inverterSerial,
      model: 'ASN-10SL',
      gatewayId: ULISSES_LIMA_REGISTRATION.gatewaySerial,
    });
    expect(JSON.stringify(createdBinding)).not.toMatch(/token|APP_SECRET\s*[:=]/i);
    expect(report.preservation.legacyUcPreserved).toBe(true);
    expect(report.preservation.distributorPreserved).toBe(true);
    expect(report.preservation.otherCustomersUntouched).toBe(true);
    expect(report.auxsolRemoteMutations).toBe(false);
    expect(report.telemetryPersisted).toBe(false);
  });

  it('é idempotente: reutiliza inversor existente e não duplica por SN', async () => {
    const { customer, plant, gateway, manufacturer } = baseFixture();
    const existingInverter = {
      id: 'inv-existing',
      plantId: plant.id,
      manufacturerId: manufacturer.id,
      manufacturer: 'AUXSOL',
      model: 'ASN-10SL',
      serialNumber: ULISSES_LIMA_REGISTRATION.inverterSerial,
      ratedPowerKw: 10,
    };
    plant.inverters = [existingInverter];
    gateway.inverterId = existingInverter.id;

    const existingBinding = {
      id: 'bind-existing',
      inverterId: existingInverter.id,
      provider: 'AUXSOL',
      externalId: String(ULISSES_LIMA_REGISTRATION.auxsolInverterId),
      externalMeta: {},
      status: IntegrationBindingStatus.READY,
      secretRef: 'AUXSOL_APP_SECRET',
    };

    const tx = {
      inverter: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(),
        update: jest.fn(),
      },
      integrationBinding: {
        findFirst: jest.fn(async () => null),
        findUnique: jest.fn(async () => existingBinding),
        create: jest.fn(),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...existingBinding,
          ...data,
        })),
      },
      equipment: {
        update: jest.fn(),
      },
      plant: {
        findUnique: jest.fn(async () => plant),
      },
      customer: {
        findUnique: jest.fn(async () => customer),
        count: jest.fn(async () => 5),
      },
    };

    const prisma = {
      customer: {
        findFirst: jest.fn(async () => customer),
        count: jest.fn(async () => 5),
      },
      inverterManufacturer: {
        findUnique: jest.fn(async () => manufacturer),
      },
      integrationBinding: {
        findUnique: jest.fn(async () => existingBinding),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const report = await ensureUlissesLimaRegistration(prisma as never);
    expect(report.created.inverter).toBe(false);
    expect(report.created.binding).toBe(false);
    expect(tx.inverter.create).not.toHaveBeenCalled();
    expect(tx.integrationBinding.create).not.toHaveBeenCalled();
    expect(tx.equipment.update).not.toHaveBeenCalled();
    expect(report.identifiers.local.inverterId).toBe('inv-existing');
  });

  it('bloqueia duplicidade de SN em outra usina', async () => {
    const { customer, plant, gateway, manufacturer } = baseFixture();
    const tx = {
      inverter: {
        findFirst: jest.fn(async () => ({ id: 'other', plantId: 'other-plant' })),
        create: jest.fn(),
      },
      integrationBinding: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      equipment: { update: jest.fn() },
      plant: { findUnique: jest.fn() },
      customer: { findUnique: jest.fn(), count: jest.fn() },
    };
    const prisma = {
      customer: {
        findFirst: jest.fn(async () => customer),
        count: jest.fn(async () => 5),
      },
      inverterManufacturer: {
        findUnique: jest.fn(async () => manufacturer),
      },
      integrationBinding: {
        findUnique: jest.fn(async () => null),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    await expect(ensureUlissesLimaRegistration(prisma as never)).rejects.toThrow(/outra usina/);
    expect(tx.inverter.create).not.toHaveBeenCalled();
    void gateway;
    void plant;
  });

  it('não associa gateway inventado: exige Equipment local confirmado', async () => {
    const { customer, plant, manufacturer } = baseFixture();
    plant.equipment = [];
    const prisma = {
      customer: {
        findFirst: jest.fn(async () => customer),
        count: jest.fn(async () => 5),
      },
      inverterManufacturer: {
        findUnique: jest.fn(async () => manufacturer),
      },
      integrationBinding: {
        findUnique: jest.fn(async () => null),
      },
      $transaction: jest.fn(),
    };

    await expect(ensureUlissesLimaRegistration(prisma as never)).rejects.toThrow(/Gateway/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('preserva UC legada e não exige Promotion automática', async () => {
    expect(ULISSES_LIMA_REGISTRATION.legacyConsumerUnit).toBe('003005596601');
    const { customer, plant, gateway, manufacturer } = baseFixture();
    expect(plant.consumerUnit).toBe('003005596601');

    const createdInverter = {
      id: 'inv-1',
      plantId: plant.id,
      manufacturerId: manufacturer.id,
      manufacturer: 'AUXSOL',
      model: 'ASN-10SL',
      serialNumber: ULISSES_LIMA_REGISTRATION.inverterSerial,
    };

    const tx = {
      inverter: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => createdInverter),
        update: jest.fn(),
      },
      integrationBinding: {
        findFirst: jest.fn(async () => null),
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'b1',
          status: IntegrationBindingStatus.READY,
          ...data,
        })),
        update: jest.fn(),
      },
      equipment: {
        update: jest.fn(async () => ({ ...gateway, inverterId: 'inv-1' })),
      },
      plant: {
        findUnique: jest.fn(async () => plant),
        update: jest.fn(),
      },
      customer: {
        findUnique: jest.fn(async () => customer),
        update: jest.fn(),
        count: jest.fn(async () => 5),
      },
    };

    const prisma = {
      customer: {
        findFirst: jest.fn(async () => customer),
        count: jest.fn(async () => 5),
      },
      inverterManufacturer: {
        findUnique: jest.fn(async () => manufacturer),
      },
      integrationBinding: {
        findUnique: jest.fn(async () => null),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const report = await ensureUlissesLimaRegistration(prisma as never);
    expect(tx.plant.update).not.toHaveBeenCalled();
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(report.preservation.legacyUcPreserved).toBe(true);
  });
});
