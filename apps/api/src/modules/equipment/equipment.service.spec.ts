import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { hasPermission } from '../auth/permissions.catalog';
import { EquipmentService } from './equipment.service';

describe('EquipmentService', () => {
  let service: EquipmentService;
  let prisma: {
    equipment: { findMany: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    plant: { findUnique: jest.Mock };
    inverter: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      equipment: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      plant: { findUnique: jest.fn() },
      inverter: { findUnique: jest.fn() },
    };
    service = new EquipmentService(prisma as never);
  });

  it('cria gateway com serial distinto do inversor', async () => {
    prisma.plant.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.inverter.findUnique.mockResolvedValue({ id: 'i1', plantId: 'p1', serialNumber: 'ASN-10SL2508230101' });
    prisma.equipment.findFirst.mockResolvedValue(null);
    prisma.equipment.create.mockResolvedValue({ id: 'e1', type: 'GATEWAY', serialNumber: 'A012509010791620' });
    await expect(service.create({
      plantId: 'p1',
      type: 'GATEWAY',
      serialNumber: 'A012509010791620',
      manufacturerName: 'AUXSOL',
      inverterId: 'i1',
    })).resolves.toMatchObject({ id: 'e1' });
    expect(prisma.equipment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'GATEWAY',
        serialNumber: 'A012509010791620',
        inverterId: 'i1',
      }),
      include: expect.any(Object),
    });
    expect(prisma.equipment.create.mock.calls[0][0].data.serialNumber).not.toBe('ASN-10SL2508230101');
  });

  it('cria datalogger com vínculo opcional ao inversor', async () => {
    prisma.plant.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.inverter.findUnique.mockResolvedValue({ id: 'i1', plantId: 'p1' });
    prisma.equipment.findFirst.mockResolvedValue(null);
    prisma.equipment.create.mockResolvedValue({ id: 'e2', type: 'DATALOGGER' });
    await service.create({
      plantId: 'p1',
      type: 'DATALOGGER',
      serialNumber: 'A012510191909021',
      inverterId: 'i1',
    });
    expect(prisma.equipment.create.mock.calls[0][0].data.inverterId).toBe('i1');
  });

  it('não exige vínculo para medidor', async () => {
    prisma.plant.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.equipment.findFirst.mockResolvedValue(null);
    prisma.equipment.create.mockResolvedValue({ id: 'e3', type: 'MEDIDOR' });
    await service.create({ plantId: 'p1', type: 'MEDIDOR', serialNumber: 'M1' });
    expect(prisma.equipment.create.mock.calls[0][0].data.inverterId).toBeNull();
    expect(prisma.inverter.findUnique).not.toHaveBeenCalled();
  });

  it('rejeita gateway com serial vazio', async () => {
    prisma.plant.findUnique.mockResolvedValue({ id: 'p1' });
    await expect(service.create({ plantId: 'p1', type: 'GATEWAY', serialNumber: '   ' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejeita usina inexistente', async () => {
    prisma.plant.findUnique.mockResolvedValue(null);
    await expect(service.create({ plantId: 'missing', type: 'MEDIDOR', serialNumber: 'EQ1' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('busca e atualiza equipamento', async () => {
    prisma.equipment.findUnique.mockResolvedValue({ id: 'e1', plantId: 'p1', type: 'GATEWAY', serialNumber: 'EQ1', inverterId: null });
    prisma.equipment.update.mockResolvedValue({ id: 'e1', model: 'M2' });
    prisma.inverter.findUnique.mockResolvedValue({ id: 'i1', plantId: 'p1' });
    await expect(service.findOne('e1')).resolves.toMatchObject({ id: 'e1' });
    await expect(service.update('e1', { inverterId: 'i1' })).resolves.toMatchObject({ model: 'M2' });
    expect(prisma.equipment.update.mock.calls[0][0].data.inverterId).toBe('i1');
  });

  it('bloqueia usuário sem permissão', () => {
    expect(hasPermission('OPERADOR', 'EQUIPMENT_CREATE')).toBe(false);
    expect(hasPermission('OPERADOR', 'EQUIPMENT_UPDATE')).toBe(false);
    expect(hasPermission('ADMINISTRADOR', 'EQUIPMENT_UPDATE')).toBe(true);
    expect(() => {
      if (!hasPermission('OPERADOR', 'EQUIPMENT_CREATE')) throw new ForbiddenException('Acesso negado');
    }).toThrow(ForbiddenException);
  });
});
