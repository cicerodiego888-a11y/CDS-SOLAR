import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { hasPermission } from '../auth/permissions.catalog';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: {
    customer: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      customer: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new CustomersService(prisma as never);
  });

  it('cria cliente válido', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ id: 'c1', name: 'Cliente A', document: '123' });
    const created = await service.create({ name: 'Cliente A', document: '123' });
    expect(created.id).toBe('c1');
    expect(prisma.customer.create.mock.calls[0][0].data.consumerId).toBeUndefined();
  });

  it('rejeita documento duplicado', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'other', document: '123' });
    await expect(service.create({ name: 'Cliente A', document: '123' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('busca cliente existente', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1', name: 'Cliente A' });
    await expect(service.findOne('c1')).resolves.toMatchObject({ id: 'c1' });
  });

  it('atualiza cliente', async () => {
    prisma.customer.findUnique.mockResolvedValueOnce({ id: 'c1' }).mockResolvedValueOnce(null);
    prisma.customer.update.mockResolvedValue({ id: 'c1', name: 'Novo' });
    await expect(service.update('c1', { name: 'Novo' })).resolves.toMatchObject({ name: 'Novo' });
  });

  it('bloqueia usuário sem permissão de criação', () => {
    expect(hasPermission('OPERADOR', 'CUSTOMERS_CREATE')).toBe(false);
    expect(hasPermission('ADMIN', 'CUSTOMERS_CREATE')).toBe(true);
    expect(() => {
      if (!hasPermission('OPERADOR', 'CUSTOMERS_CREATE')) throw new ForbiddenException('Acesso negado');
    }).toThrow(ForbiddenException);
  });

  it('cliente existente sem consumidor continua funcionando', async () => {
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1',
      name: 'Antigo',
      document: '00000000000100',
      consumerId: null,
    });
    await expect(service.findOne('c1')).resolves.toMatchObject({ id: 'c1', name: 'Antigo', consumerId: null });
    prisma.customer.update.mockResolvedValue({ id: 'c1', phone: '88999990000' });
    await expect(service.update('c1', { phone: '88999990000' })).resolves.toMatchObject({ id: 'c1' });
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { phone: '88999990000' },
    });
  });

  it('falha ao buscar cliente inexistente', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
