import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { hasPermission } from '../auth/permissions.catalog';
import { InvertersService } from './inverters.service';

describe('InvertersService', () => {
  let service: InvertersService;
  let prisma: {
    inverter: { findMany: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    plant: { findUnique: jest.Mock };
    inverterManufacturer: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      inverter: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      plant: { findUnique: jest.fn() },
      inverterManufacturer: { findUnique: jest.fn() },
    };
    service = new InvertersService(prisma as never);
  });

  const payload = {
    plantId: 'p1',
    manufacturerId: 'm1',
    model: 'ASN-10SL',
    serialNumber: 'ASN-10SL2508230101',
    ratedPowerKw: 10,
  };

  it('cria inversor válido com fabricante do catálogo', async () => {
    prisma.plant.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.inverterManufacturer.findUnique.mockResolvedValue({ id: 'm1', code: 'AUXSOL' });
    prisma.inverter.findFirst.mockResolvedValue(null);
    prisma.inverter.create.mockResolvedValue({ id: 'i1', manufacturer: 'AUXSOL', serialNumber: payload.serialNumber });
    await expect(service.create(payload)).resolves.toMatchObject({ manufacturer: 'AUXSOL' });
    expect(prisma.inverter.create.mock.calls[0][0].data.externalId).toBeNull();
  });

  it('aceita externalId opcional sem torná-lo identidade de integração', async () => {
    prisma.plant.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.inverterManufacturer.findUnique.mockResolvedValue({ id: 'm1', code: 'AUXSOL' });
    prisma.inverter.findFirst.mockResolvedValue(null);
    prisma.inverter.create.mockResolvedValue({ id: 'i1' });
    await service.create({ ...payload, externalId: '  legacy-ext  ' });
    expect(prisma.inverter.create.mock.calls[0][0].data.externalId).toBe('legacy-ext');
  });

  it('impede serial duplicado na mesma usina', async () => {
    prisma.plant.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.inverterManufacturer.findUnique.mockResolvedValue({ id: 'm1', code: 'AUXSOL' });
    prisma.inverter.findFirst.mockResolvedValue({ id: 'other', serialNumber: payload.serialNumber });
    await expect(service.create(payload)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejeita usina inexistente', async () => {
    prisma.plant.findUnique.mockResolvedValue(null);
    prisma.inverterManufacturer.findUnique.mockResolvedValue({ id: 'm1', code: 'DEYE' });
    await expect(service.create(payload)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejeita fabricante inexistente e não aceita texto livre', async () => {
    prisma.plant.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.inverterManufacturer.findUnique.mockResolvedValue(null);
    await expect(service.create(payload)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('busca e atualiza inversor', async () => {
    prisma.inverter.findUnique.mockResolvedValue({ id: 'i1', plantId: 'p1', manufacturer: 'DEYE', serialNumber: 'SN1' });
    prisma.inverter.findFirst.mockResolvedValue(null);
    prisma.inverter.update.mockResolvedValue({ id: 'i1', model: 'X2' });
    await expect(service.findOne('i1')).resolves.toMatchObject({ id: 'i1' });
    await expect(service.update('i1', { model: 'X2' })).resolves.toMatchObject({ model: 'X2' });
  });

  it('bloqueia usuário sem permissão', () => {
    expect(hasPermission('OPERADOR', 'INVERTERS_CREATE')).toBe(false);
    expect(hasPermission('OPERADOR', 'INVERTERS_UPDATE')).toBe(false);
    expect(hasPermission('ADMINISTRADOR', 'INVERTERS_UPDATE')).toBe(true);
    expect(() => {
      if (!hasPermission('OPERADOR', 'INVERTERS_CREATE')) throw new ForbiddenException('Acesso negado');
    }).toThrow(ForbiddenException);
  });
});
