import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { IntegrationBindingStatus } from '@prisma/client';
import { IntegrationBindingService } from './integration-binding.service';
import * as lookup from './auxsol-identity.lookup';
import * as transportMod from '../auxsol/auxsol.transport';

jest.mock('./auxsol-identity.lookup');
jest.mock('../auxsol/auxsol.transport', () => ({
  createAuxsolTransport: jest.fn(),
}));

describe('IntegrationBindingService', () => {
  const user = { sub: 'u1', role: 'ADMIN', email: 'a@b7.local' };
  let prisma: {
    inverter: { findUnique: jest.Mock };
    integrationBinding: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let authorization: { assertPlantAccess: jest.Mock };
  let service: IntegrationBindingService;

  const inverter = {
    id: 'inv-1',
    plantId: 'p1',
    serialNumber: 'ASN-10SL2508230101',
    model: 'ASN-10SL',
    manufacturer: 'AUXSOL',
    manufacturerId: 'm1',
    manufacturerRef: { code: 'AUXSOL', name: 'AUXSOL' },
    plant: { id: 'p1', customerId: 'c1', name: 'José' },
  };

  beforeEach(() => {
    prisma = {
      inverter: { findUnique: jest.fn().mockResolvedValue(inverter) },
      integrationBinding: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    authorization = { assertPlantAccess: jest.fn().mockResolvedValue({}) };
    service = new IntegrationBindingService(prisma as never, authorization as never);
    (transportMod.createAuxsolTransport as jest.Mock).mockReturnValue({ mode: 'live' });
    (lookup.loadAuxsolInventory as jest.Mock).mockResolvedValue([]);
  });

  it('impede binding sem lookupKey', async () => {
    await expect(service.create('inv-1', { lookupKey: '  ' }, user))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('TARGET_NOT_FOUND não cria binding', async () => {
    (lookup.findAuxsolIdentityInInventory as jest.Mock).mockReturnValue({
      found: false,
      observed: [],
    });
    const result = await service.validate('inv-1', { lookupKey: 'ASN-10SL2508230101' }, user);
    expect(result).toMatchObject({ found: false, code: 'TARGET_NOT_FOUND' });
    await expect(service.create('inv-1', { lookupKey: 'ASN-10SL2508230101' }, user))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.integrationBinding.create).not.toHaveBeenCalled();
  });

  it('cria binding válido após identidade oficial', async () => {
    (lookup.findAuxsolIdentityInInventory as jest.Mock).mockReturnValue({
      found: true,
      plantId: 'plant-x',
      plantName: 'Plant X',
      inverterId: 'ext-99',
      sn: 'ASN-10SL2508230101',
      model: 'ASN-10SL',
      gateway: 'A012509010791620',
      identifiers: {},
    });
    prisma.integrationBinding.create.mockResolvedValue({
      id: 'b1',
      provider: 'AUXSOL',
      inverterId: 'inv-1',
      manufacturerId: 'm1',
      externalId: 'ext-99',
      externalMeta: { provider: 'AUXSOL', inverterId: 'ext-99' },
      status: IntegrationBindingStatus.READY,
      lastSyncAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      secretRef: 'SHOULD_NOT_LEAK',
    });

    const created = await service.create('inv-1', { lookupKey: 'ASN-10SL2508230101' }, user);
    expect(created.binding.externalId).toBe('ext-99');
    expect(created.binding).not.toHaveProperty('secretRef');
    expect(prisma.integrationBinding.create).toHaveBeenCalled();
  });

  it('impede binding duplicado conflitante em outro inversor', async () => {
    (lookup.findAuxsolIdentityInInventory as jest.Mock).mockReturnValue({
      found: true,
      plantId: 'plant-x',
      plantName: 'Plant X',
      inverterId: 'ext-99',
      sn: 'ASN-10SL2508230101',
      model: 'ASN-10SL',
      gateway: null,
      identifiers: {},
    });
    prisma.integrationBinding.findFirst.mockResolvedValue({
      id: 'other',
      inverter: { id: 'inv-2', serialNumber: 'OTHER', plantId: 'p2' },
    });
    await expect(service.create('inv-1', { lookupKey: 'ASN-10SL2508230101' }, user))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('impede binding para fabricante incompatível', async () => {
    prisma.inverter.findUnique.mockResolvedValue({
      ...inverter,
      manufacturer: 'DEYE',
      manufacturerRef: { code: 'DEYE', name: 'Deye' },
    });
    const result = await service.validate('inv-1', { lookupKey: 'x' }, user);
    expect(result.code).toBe('MANUFACTURER_NOT_SUPPORTED');
    await expect(service.create('inv-1', { lookupKey: 'x' }, user))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('impede binding fora do escopo', async () => {
    authorization.assertPlantAccess.mockRejectedValue(new NotFoundException('Usina não encontrada.'));
    await expect(service.get('inv-1', { ...user, role: 'CUSTOMER', sub: 'c' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('GET não retorna secretRef', async () => {
    prisma.integrationBinding.findUnique.mockResolvedValue({
      id: 'b1',
      provider: 'AUXSOL',
      inverterId: 'inv-1',
      manufacturerId: 'm1',
      externalId: 'ext-1',
      externalMeta: { provider: 'AUXSOL' },
      status: 'READY',
      secretRef: 'secret',
      lastSyncAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.get('inv-1', user);
    expect(result.binding).not.toHaveProperty('secretRef');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('conflito de serial local vs fabricante', async () => {
    (lookup.findAuxsolIdentityInInventory as jest.Mock).mockReturnValue({
      found: true,
      plantId: 'plant-x',
      plantName: 'Plant X',
      inverterId: 'ext-99',
      sn: 'ASN-OTHER',
      model: 'ASN-10SL',
      gateway: null,
      identifiers: {},
    });
    await expect(service.validate('inv-1', { lookupKey: 'ext-99' }, user))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('remove binding autorizado', async () => {
    prisma.integrationBinding.findUnique.mockResolvedValue({
      id: 'b1',
      provider: 'AUXSOL',
      inverterId: 'inv-1',
    });
    prisma.integrationBinding.delete.mockResolvedValue({});
    await expect(service.remove('inv-1', user)).resolves.toMatchObject({ ok: true, provider: 'AUXSOL' });
  });
});
