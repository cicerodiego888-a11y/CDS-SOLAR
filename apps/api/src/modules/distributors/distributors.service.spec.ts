import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { hasPermission } from '../auth/permissions.catalog';
import { DistributorsService } from './distributors.service';

describe('DistributorsService', () => {
  let service: DistributorsService;
  let prisma: {
    distributor: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      distributor: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new DistributorsService(prisma as never);
  });

  it('cria distribuidora', async () => {
    prisma.distributor.findUnique.mockResolvedValue(null);
    prisma.distributor.create.mockResolvedValue({ id: 'd1', name: 'ENEL CE', code: 'ENEL-CE' });
    const created = await service.create({ name: 'ENEL CE', code: 'enel-ce' });
    expect(created.id).toBe('d1');
    expect(prisma.distributor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'ENEL-CE', name: 'ENEL CE', status: 'ACTIVE' }),
    });
  });

  it('lista distribuidoras', async () => {
    prisma.distributor.findMany.mockResolvedValue([{ id: 'd1' }]);
    await expect(service.findAll({ status: 'ACTIVE' })).resolves.toEqual([{ id: 'd1' }]);
  });

  it('busca por ID', async () => {
    prisma.distributor.findUnique.mockResolvedValue({ id: 'd1', name: 'ENEL' });
    await expect(service.findOne('d1')).resolves.toMatchObject({ id: 'd1' });
  });

  it('atualiza distribuidora', async () => {
    prisma.distributor.findUnique.mockResolvedValueOnce({ id: 'd1' }).mockResolvedValueOnce(null);
    prisma.distributor.update.mockResolvedValue({ id: 'd1', name: 'Nova' });
    await expect(service.update('d1', { name: 'Nova' })).resolves.toMatchObject({ name: 'Nova' });
  });

  it('ativa/desativa', async () => {
    prisma.distributor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.distributor.update.mockResolvedValue({ id: 'd1', status: 'INACTIVE' });
    await expect(service.updateStatus('d1', { status: 'INACTIVE' })).resolves.toMatchObject({ status: 'INACTIVE' });
  });

  it('9. não duplica Distributor pelo código', async () => {
    prisma.distributor.findUnique.mockResolvedValue({ id: 'other', code: 'ENEL' });
    await expect(service.create({ name: 'X', code: 'ENEL' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('8. consulta Distributor existente', async () => {
    prisma.distributor.findUnique.mockResolvedValue({ id: 'd1', name: 'Equatorial' });
    await expect(service.findOne('d1')).resolves.toMatchObject({ id: 'd1', name: 'Equatorial' });
  });

  it('rejeita código duplicado', async () => {
    prisma.distributor.findUnique.mockResolvedValue({ id: 'other', code: 'ENEL' });
    await expect(service.create({ name: 'X', code: 'ENEL' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('falha ao buscar inexistente', async () => {
    prisma.distributor.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('autorização: OPERADOR vê, CONSUMIDOR não cria', () => {
    expect(hasPermission('OPERADOR', 'DISTRIBUTORS_VIEW')).toBe(true);
    expect(hasPermission('ADMIN', 'DISTRIBUTORS_CREATE')).toBe(true);
    expect(hasPermission('CONSUMIDOR', 'DISTRIBUTORS_CREATE')).toBe(false);
    expect(() => {
      if (!hasPermission('CONSUMIDOR', 'DISTRIBUTORS_CREATE')) throw new ForbiddenException('Acesso negado');
    }).toThrow(ForbiddenException);
  });
});
