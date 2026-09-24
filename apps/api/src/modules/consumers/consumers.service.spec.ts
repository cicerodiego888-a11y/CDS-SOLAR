import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { hasPermission } from '../auth/permissions.catalog';
import { ConsumersService } from './consumers.service';

describe('ConsumersService', () => {
  let service: ConsumersService;
  let prisma: {
    consumer: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      consumer: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new ConsumersService(prisma as never);
  });

  it('cria consumidor', async () => {
    prisma.consumer.findUnique.mockResolvedValue(null);
    prisma.consumer.create.mockResolvedValue({ id: 'c1', name: 'João', document: '52998224725' });
    const created = await service.create({ name: 'João', document: '529.982.247-25', documentType: 'CPF' });
    expect(created.id).toBe('c1');
    expect(prisma.consumer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'João',
        document: '52998224725',
        documentType: 'CPF',
        status: 'ACTIVE',
      }),
    });
  });

  it('lista consumidores', async () => {
    prisma.consumer.findMany.mockResolvedValue([{ id: 'c1' }]);
    await expect(service.findAll({ name: 'Jo' })).resolves.toEqual([{ id: 'c1' }]);
  });

  it('busca por ID', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    await expect(service.findOne('c1')).resolves.toMatchObject({ id: 'c1' });
  });

  it('atualiza consumidor', async () => {
    prisma.consumer.findUnique.mockResolvedValueOnce({ id: 'c1' }).mockResolvedValueOnce(null);
    prisma.consumer.update.mockResolvedValue({ id: 'c1', name: 'Maria' });
    await expect(service.update('c1', { name: 'Maria' })).resolves.toMatchObject({ name: 'Maria' });
  });

  it('ativa/desativa', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.consumer.update.mockResolvedValue({ id: 'c1', status: 'INACTIVE' });
    await expect(service.updateStatus('c1', { status: 'INACTIVE' })).resolves.toMatchObject({ status: 'INACTIVE' });
  });

  it('rejeita documento duplicado', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'other', document: '52998224725' });
    await expect(service.create({ name: 'X', document: '529.982.247-25', documentType: 'CPF' }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('falha ao buscar inexistente', async () => {
    prisma.consumer.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('permite Consumer sem Customer e sem User (payload não exige vínculo)', async () => {
    prisma.consumer.findUnique.mockResolvedValue(null);
    prisma.consumer.create.mockResolvedValue({ id: 'c1', name: 'Independente', document: '11222333000181' });
    const created = await service.create({ name: 'Independente', document: '11.222.333/0001-81', documentType: 'CNPJ' });
    const data = prisma.consumer.create.mock.calls[0][0].data;
    expect(data.customerId).toBeUndefined();
    expect(data.userId).toBeUndefined();
    expect(created.id).toBe('c1');
  });

  it('autorização: COMERCIAL cria, INVESTIDOR não', () => {
    expect(hasPermission('COMERCIAL', 'CONSUMERS_CREATE')).toBe(true);
    expect(hasPermission('INVESTIDOR', 'CONSUMERS_VIEW')).toBe(false);
    expect(() => {
      if (!hasPermission('INVESTIDOR', 'CONSUMERS_CREATE')) throw new ForbiddenException('Acesso negado');
    }).toThrow(ForbiddenException);
  });
});
