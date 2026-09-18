import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { hasPermission } from '../auth/permissions.catalog';
import { PlantsService } from './plants.service';

describe('PlantsService', () => {
  let service: PlantsService;
  let prisma: {
    plant: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    customer: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      plant: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      customer: { findUnique: jest.fn() },
    };
    service = new PlantsService(prisma as never);
  });

  it('cria usina válida', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.plant.create.mockResolvedValue({ id: 'p1', name: 'Usina A' });
    await expect(service.create({
      customerId: 'c1',
      name: 'Usina A',
      installedPowerKw: 10,
      distributor: 'ENEL',
      consumerUnit: '123',
    })).resolves.toMatchObject({ id: 'p1' });
  });

  it('rejeita cliente inexistente', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.create({
      customerId: 'missing',
      name: 'Usina A',
      installedPowerKw: 10,
      distributor: 'ENEL',
      consumerUnit: '123',
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('busca e atualiza usina', async () => {
    prisma.plant.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.plant.update.mockResolvedValue({ id: 'p1', name: 'Usina B' });
    await expect(service.findOne('p1')).resolves.toMatchObject({ id: 'p1' });
    await expect(service.update('p1', { name: 'Usina B' })).resolves.toMatchObject({ name: 'Usina B' });
  });

  it('bloqueia usuário sem permissão de criação', () => {
    expect(hasPermission('OPERADOR', 'PLANTS_CREATE')).toBe(false);
    expect(hasPermission('ADMINISTRADOR', 'PLANTS_CREATE')).toBe(true);
    expect(() => {
      if (!hasPermission('OPERADOR', 'PLANTS_CREATE')) throw new ForbiddenException('Acesso negado');
    }).toThrow(ForbiddenException);
  });

  it('cria usina sem concessionária e UC (campos legados opcionais)', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.plant.create.mockResolvedValue({ id: 'p2', name: 'Usina B' });
    await service.create({
      customerId: 'c1',
      name: 'Usina B',
      installedPowerKw: 8.5,
    });
    expect(prisma.plant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        distributor: null,
        consumerUnit: null,
        installedPowerKw: 8.5,
      }),
      include: { customer: true },
    });
  });

  it('preserva campos legados distributor e consumerUnit no create', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.plant.create.mockResolvedValue({ id: 'p1', distributor: 'ENEL', consumerUnit: '123' });
    await service.create({
      customerId: 'c1',
      name: 'Usina A',
      installedPowerKw: 10,
      distributor: 'ENEL',
      consumerUnit: '123',
    });
    expect(prisma.plant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        distributor: 'ENEL',
        consumerUnit: '123',
      }),
      include: { customer: true },
    });
    expect(prisma.plant.create.mock.calls[0][0].data).not.toHaveProperty('distributorId');
    expect(prisma.plant.create.mock.calls[0][0].data).not.toHaveProperty('consumerUnitId');
  });
});
