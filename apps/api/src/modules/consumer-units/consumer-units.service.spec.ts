import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { hasPermission } from '../auth/permissions.catalog';
import { ConsumerUnitsService } from './consumer-units.service';

describe('ConsumerUnitsService', () => {
  let service: ConsumerUnitsService;
  let prisma: {
    consumerUnit: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    consumer: { findUnique: jest.Mock };
    distributor: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      consumerUnit: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      consumer: { findUnique: jest.fn() },
      distributor: { findUnique: jest.fn() },
    };
    service = new ConsumerUnitsService(prisma as never);
  });

  it('1. Consumer sem UC retorna lista vazia', async () => {
    prisma.consumerUnit.findMany.mockResolvedValue([]);
    await expect(service.findAll({ consumerId: 'c1' })).resolves.toEqual([]);
  });

  it('2. cria UC normalizando o número', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.distributor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.consumerUnit.findUnique.mockResolvedValue(null);
    prisma.consumerUnit.create.mockResolvedValue({ id: 'u1', number: '11230436', consumerId: 'c1', distributorId: 'd1' });
    const created = await service.create({
      consumerId: 'c1',
      distributorId: 'd1',
      number: '11.230.436',
      contractAccount: '003.005.596.601',
    });
    expect(created.id).toBe('u1');
    expect(prisma.consumerUnit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        number: '11230436',
        contractAccount: '003005596601',
        consumerId: 'c1',
        distributorId: 'd1',
      }),
      include: expect.any(Object),
    });
    expect(prisma.consumerUnit.create.mock.calls[0][0].data.plantId).toBeUndefined();
  });

  it('3. lista UCs', async () => {
    prisma.consumerUnit.findMany.mockResolvedValue([{ id: 'u1' }]);
    await expect(service.findAll({ consumerId: 'c1' })).resolves.toEqual([{ id: 'u1' }]);
  });

  it('4. edita UC', async () => {
    prisma.consumerUnit.findUnique
      .mockResolvedValueOnce({ id: 'u1', consumerId: 'c1', distributorId: 'd1', number: '123' })
      .mockResolvedValueOnce(null);
    prisma.consumerUnit.update.mockResolvedValue({ id: 'u1', address: 'Rua A', contractAccount: '99' });
    await expect(service.update('u1', { address: 'Rua A', contractAccount: '99' }))
      .resolves.toMatchObject({ address: 'Rua A' });
  });

  it('10. Conta Contrato é separada da UC', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.distributor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.consumerUnit.findUnique.mockResolvedValue(null);
    prisma.consumerUnit.create.mockResolvedValue({ id: 'u1' });
    await service.create({
      consumerId: 'c1',
      distributorId: 'd1',
      number: '11230436',
      contractAccount: '003005596601',
    });
    const data = prisma.consumerUnit.create.mock.calls[0][0].data;
    expect(data.number).toBe('11230436');
    expect(data.contractAccount).toBe('003005596601');
    expect(data.number).not.toBe(data.contractAccount);
  });

  it('11. permite UC sem Conta Contrato', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.distributor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.consumerUnit.findUnique.mockResolvedValue(null);
    prisma.consumerUnit.create.mockResolvedValue({ id: 'u1' });
    await service.create({ consumerId: 'c1', distributorId: 'd1', number: '11230436' });
    expect(prisma.consumerUnit.create.mock.calls[0][0].data.contractAccount).toBeUndefined();
  });

  it('16. não cria UC duplicada na mesma distribuidora', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.distributor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.consumerUnit.findUnique.mockResolvedValue({ id: 'other', distributorId: 'd1', number: '123' });
    await expect(service.create({ consumerId: 'c1', distributorId: 'd1', number: '123' }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('17. permite múltiplas UCs para o mesmo Consumer', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.distributor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.consumerUnit.findUnique.mockResolvedValue(null);
    prisma.consumerUnit.create
      .mockResolvedValueOnce({ id: 'u1', consumerId: 'c1', number: '1' })
      .mockResolvedValueOnce({ id: 'u2', consumerId: 'c1', number: '2' });
    await service.create({ consumerId: 'c1', distributorId: 'd1', number: '1' });
    await service.create({ consumerId: 'c1', distributorId: 'd1', number: '2' });
    expect(prisma.consumerUnit.create).toHaveBeenCalledTimes(2);
  });

  it('19. validação rejeita número vazio', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.distributor.findUnique.mockResolvedValue({ id: 'd1' });
    await expect(service.create({ consumerId: 'c1', distributorId: 'd1', number: '   ' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('8. exige Distributor existente', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.distributor.findUnique.mockResolvedValue(null);
    await expect(service.create({ consumerId: 'c1', distributorId: 'x', number: '1' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejeita Consumer inexistente', async () => {
    prisma.consumer.findUnique.mockResolvedValue(null);
    await expect(service.create({ consumerId: 'x', distributorId: 'd1', number: '1' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('ativa/desativa', async () => {
    prisma.consumerUnit.findUnique.mockResolvedValue({ id: 'u1' });
    prisma.consumerUnit.update.mockResolvedValue({ id: 'u1', status: 'INACTIVE' });
    await expect(service.updateStatus('u1', { status: 'INACTIVE' })).resolves.toMatchObject({ status: 'INACTIVE' });
  });

  it('busca por ID', async () => {
    prisma.consumerUnit.findUnique.mockResolvedValue({ id: 'u1' });
    await expect(service.findOne('u1')).resolves.toMatchObject({ id: 'u1' });
  });

  it('falha ao buscar inexistente', async () => {
    prisma.consumerUnit.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('20. autorização: OPERADOR vê, CONSUMIDOR portal não atualiza UC', () => {
    expect(hasPermission('OPERADOR', 'CONSUMER_UNITS_VIEW')).toBe(true);
    expect(hasPermission('ADMINISTRADOR', 'CONSUMER_UNITS_UPDATE')).toBe(true);
    expect(hasPermission('CONSUMIDOR', 'CONSUMER_UNITS_UPDATE')).toBe(false);
    expect(() => {
      if (!hasPermission('CONSUMIDOR', 'CONSUMER_UNITS_UPDATE')) throw new ForbiddenException('Acesso negado');
    }).toThrow(ForbiddenException);
  });
});
