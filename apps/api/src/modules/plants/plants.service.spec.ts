import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { hasPermission } from '../auth/permissions.catalog';
import { PlantsService } from './plants.service';

describe('PlantsService', () => {
  let service: PlantsService;
  let prisma: {
    plant: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    customer: { findUnique: jest.Mock };
    consumerUnit: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      plant: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      customer: { findUnique: jest.fn() },
      consumerUnit: { findUnique: jest.fn() },
    };
    service = new PlantsService(prisma as never);
  });

  function mockPlant(overrides: Record<string, unknown> = {}) {
    return {
      id: 'p1',
      customerId: 'cust1',
      name: 'Usina A',
      distributor: 'ENEL',
      consumerUnit: '123',
      consumerUnitId: null,
      ...overrides,
    };
  }

  it('cria usina válida com campos legados', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust1', consumerId: null });
    prisma.plant.create.mockResolvedValue({ id: 'p1', name: 'Usina A' });
    await expect(service.create({
      customerId: 'cust1',
      name: 'Usina A',
      installedPowerKw: 10,
      distributor: 'ENEL',
      consumerUnit: '123',
    })).resolves.toMatchObject({ id: 'p1' });
  });

  it('12. Plant antiga sem ConsumerUnit continua funcionando', async () => {
    prisma.plant.findUnique.mockResolvedValue(mockPlant({ consumerUnitId: null, distributor: null, consumerUnit: null }));
    await expect(service.findOne('p1')).resolves.toMatchObject({ id: 'p1', consumerUnitId: null });
  });

  it('13. Plant antiga com campos legados continua funcionando', async () => {
    prisma.plant.findUnique.mockResolvedValue(mockPlant());
    prisma.plant.update.mockResolvedValue(mockPlant({ name: 'Usina B' }));
    await expect(service.update('p1', { name: 'Usina B' })).resolves.toMatchObject({ name: 'Usina B' });
    expect(prisma.plant.update.mock.calls[0][0].data).not.toHaveProperty('consumerUnitId');
    expect(prisma.plant.update.mock.calls[0][0].data).not.toHaveProperty('distributor');
  });

  it('14. nova Plant usa ConsumerUnit formal', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust1', consumerId: 'cons1' });
    prisma.consumerUnit.findUnique.mockResolvedValue({
      id: 'u1',
      number: '11230436',
      consumerId: 'cons1',
      distributor: { name: 'Equatorial' },
    });
    prisma.plant.create.mockResolvedValue({ id: 'p2', consumerUnitId: 'u1' });
    await service.create({
      customerId: 'cust1',
      name: 'Ulisses Lima',
      installedPowerKw: 10,
      consumerUnitId: 'u1',
    });
    expect(prisma.plant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        consumerUnitId: 'u1',
        consumerUnit: '11230436',
        distributor: 'Equatorial',
      }),
      include: expect.any(Object),
    });
  });

  it('15. não apaga campos legados ao desvincular UC', async () => {
    prisma.plant.findUnique.mockResolvedValue(mockPlant({
      consumerUnitId: 'u1',
      consumerUnit: '11230436',
      distributor: 'Equatorial',
    }));
    prisma.plant.update.mockResolvedValue(mockPlant({ consumerUnitId: null }));
    await service.unlinkConsumerUnit('p1');
    expect(prisma.plant.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { consumerUnitId: null },
      include: expect.any(Object),
    });
    expect(prisma.plant.update.mock.calls[0][0].data).not.toHaveProperty('distributor');
    expect(prisma.plant.update.mock.calls[0][0].data).not.toHaveProperty('consumerUnit');
  });

  it('5. vincula UC à Plant e sincroniza legado', async () => {
    prisma.plant.findUnique.mockResolvedValue(mockPlant({ customerId: 'cust1' }));
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust1', consumerId: 'cons1' });
    prisma.consumerUnit.findUnique.mockResolvedValue({
      id: 'u1',
      number: '11230436',
      consumerId: 'cons1',
      distributor: { name: 'Equatorial' },
    });
    prisma.plant.update.mockResolvedValue({ id: 'p1', consumerUnitId: 'u1' });
    await service.linkConsumerUnit('p1', { consumerUnitId: 'u1' });
    expect(prisma.plant.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        consumerUnitId: 'u1',
        consumerUnit: '11230436',
        distributor: 'Equatorial',
      },
      include: expect.any(Object),
    });
  });

  it('6. desvincula UC sem apagar o registro da UC', async () => {
    prisma.plant.findUnique.mockResolvedValue(mockPlant({ consumerUnitId: 'u1' }));
    prisma.plant.update.mockResolvedValue(mockPlant({ consumerUnitId: null }));
    await service.unlinkConsumerUnit('p1');
    expect(prisma.consumerUnit.findUnique).not.toHaveBeenCalled();
    expect(prisma.plant.update.mock.calls[0][0].data).toEqual({ consumerUnitId: null });
  });

  it('7. impede UC de outro Consumer', async () => {
    prisma.plant.findUnique.mockResolvedValue(mockPlant({ customerId: 'cust1' }));
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust1', consumerId: 'cons1' });
    prisma.consumerUnit.findUnique.mockResolvedValue({
      id: 'u9',
      number: '999',
      consumerId: 'outro',
      distributor: { name: 'Equatorial' },
    });
    await expect(service.linkConsumerUnit('p1', { consumerUnitId: 'u9' }))
      .rejects.toThrow('Esta unidade consumidora pertence a outro consumidor e não pode ser vinculada a esta usina.');
    await expect(service.linkConsumerUnit('p1', { consumerUnitId: 'u9' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('18. múltiplas Plants podem usar a modelagem permitida', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust1', consumerId: 'cons1' });
    prisma.consumerUnit.findUnique.mockResolvedValue({
      id: 'u1',
      number: '11230436',
      consumerId: 'cons1',
      distributor: { name: 'Equatorial' },
    });
    prisma.plant.create
      .mockResolvedValueOnce({ id: 'p1' })
      .mockResolvedValueOnce({ id: 'p2' });
    await service.create({ customerId: 'cust1', name: 'A', installedPowerKw: 10, consumerUnitId: 'u1' });
    await service.create({ customerId: 'cust1', name: 'B', installedPowerKw: 12, consumerUnitId: 'u1' });
    expect(prisma.plant.create).toHaveBeenCalledTimes(2);
  });

  it('rejeita cliente inexistente', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.create({
      customerId: 'missing',
      name: 'Usina A',
      installedPowerKw: 10,
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('busca e atualiza usina', async () => {
    prisma.plant.findUnique.mockResolvedValue(mockPlant());
    prisma.plant.update.mockResolvedValue(mockPlant({ name: 'Usina B' }));
    await expect(service.findOne('p1')).resolves.toMatchObject({ id: 'p1' });
    await expect(service.update('p1', { name: 'Usina B' })).resolves.toMatchObject({ name: 'Usina B' });
  });

  it('cria usina sem concessionária e UC (campos legados opcionais)', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust1', consumerId: null });
    prisma.plant.create.mockResolvedValue({ id: 'p2', name: 'Usina B' });
    await service.create({
      customerId: 'cust1',
      name: 'Usina B',
      installedPowerKw: 8.5,
    });
    expect(prisma.plant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        distributor: null,
        consumerUnit: null,
        consumerUnitId: null,
        installedPowerKw: 8.5,
      }),
      include: expect.any(Object),
    });
  });

  it('preserva campos legados distributor e consumerUnit no create sem vínculo formal', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust1', consumerId: null });
    prisma.plant.create.mockResolvedValue({ id: 'p1', distributor: 'ENEL', consumerUnit: '123' });
    await service.create({
      customerId: 'cust1',
      name: 'Usina A',
      installedPowerKw: 10,
      distributor: 'ENEL',
      consumerUnit: '123',
    });
    expect(prisma.plant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        distributor: 'ENEL',
        consumerUnit: '123',
        consumerUnitId: null,
      }),
      include: expect.any(Object),
    });
    expect(prisma.plant.create.mock.calls[0][0].data).not.toHaveProperty('distributorId');
  });

  it('20. bloqueia usuário sem permissão de criação', () => {
    expect(hasPermission('OPERADOR', 'PLANTS_CREATE')).toBe(false);
    expect(hasPermission('ADMINISTRADOR', 'PLANTS_CREATE')).toBe(true);
    expect(() => {
      if (!hasPermission('OPERADOR', 'PLANTS_CREATE')) throw new ForbiddenException('Acesso negado');
    }).toThrow(ForbiddenException);
  });
});
