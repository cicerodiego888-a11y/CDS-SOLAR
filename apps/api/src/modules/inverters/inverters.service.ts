import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EquipmentType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateInverterDto, StatusDto, UpdateInverterDto } from '../common/dto';

const inverterInclude = {
  plant: { include: { customer: true } },
  manufacturerRef: true,
  equipment: {
    where: { type: { in: [EquipmentType.GATEWAY, EquipmentType.DATALOGGER] } },
    orderBy: { createdAt: 'desc' as const },
  },
  bindings: {
    select: {
      id: true,
      provider: true,
      externalId: true,
      externalMeta: true,
      status: true,
      lastSyncAt: true,
      lastErrorAt: true,
      lastErrorMessage: true,
    },
  },
};

@Injectable()
export class InvertersService {
  constructor(private prisma: PrismaService) {}

  findAll(filters?: { plantId?: string; manufacturerId?: string; status?: string; search?: string }) {
    return this.prisma.inverter.findMany({
      where: {
        ...(filters?.plantId ? { plantId: filters.plantId } : {}),
        ...(filters?.manufacturerId ? { manufacturerId: filters.manufacturerId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.search
          ? {
              OR: [
                { model: { contains: filters.search, mode: 'insensitive' } },
                { serialNumber: { contains: filters.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: inverterInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const inverter = await this.prisma.inverter.findUnique({ where: { id }, include: inverterInclude });
    if (!inverter) throw new NotFoundException('Inversor não encontrado.');
    return inverter;
  }

  async create(dto: CreateInverterDto) {
    const [plant, manufacturer] = await Promise.all([
      this.prisma.plant.findUnique({ where: { id: dto.plantId } }),
      this.prisma.inverterManufacturer.findUnique({ where: { id: dto.manufacturerId } }),
    ]);
    if (!plant) throw new NotFoundException('Usina não encontrada.');
    if (!manufacturer) throw new NotFoundException('Fabricante não encontrado no catálogo oficial.');
    await this.assertSerial(dto.plantId, dto.serialNumber);
    return this.prisma.inverter.create({
      data: {
        plantId: dto.plantId,
        manufacturerId: manufacturer.id,
        manufacturer: manufacturer.code,
        model: dto.model.trim(),
        serialNumber: dto.serialNumber.trim(),
        ratedPowerKw: dto.ratedPowerKw,
        externalId: dto.externalId?.trim() || null,
        status: dto.status ?? 'ACTIVE',
      },
      include: inverterInclude,
    });
  }

  async update(id: string, dto: UpdateInverterDto) {
    const current = await this.findOne(id);
    if (dto.plantId) {
      const plant = await this.prisma.plant.findUnique({ where: { id: dto.plantId } });
      if (!plant) throw new NotFoundException('Usina não encontrada.');
    }
    let manufacturerCode = current.manufacturer;
    if (dto.manufacturerId) {
      const manufacturer = await this.prisma.inverterManufacturer.findUnique({ where: { id: dto.manufacturerId } });
      if (!manufacturer) throw new NotFoundException('Fabricante não encontrado no catálogo oficial.');
      manufacturerCode = manufacturer.code;
    }
    const plantId = dto.plantId ?? current.plantId;
    const serial = dto.serialNumber ?? current.serialNumber ?? '';
    if (dto.serialNumber || dto.plantId) await this.assertSerial(plantId, serial, id);
    return this.prisma.inverter.update({
      where: { id },
      data: {
        ...(dto.plantId ? { plantId: dto.plantId } : {}),
        ...(dto.manufacturerId ? { manufacturerId: dto.manufacturerId, manufacturer: manufacturerCode } : {}),
        ...(dto.model ? { model: dto.model.trim() } : {}),
        ...(dto.serialNumber ? { serialNumber: dto.serialNumber.trim() } : {}),
        ...(dto.ratedPowerKw !== undefined ? { ratedPowerKw: dto.ratedPowerKw } : {}),
        ...(dto.externalId !== undefined ? { externalId: dto.externalId?.trim() || null } : {}),
      },
      include: inverterInclude,
    });
  }

  async updateStatus(id: string, dto: StatusDto) {
    await this.findOne(id);
    return this.prisma.inverter.update({ where: { id }, data: { status: dto.status }, include: inverterInclude });
  }

  private async assertSerial(plantId: string, serialNumber: string, ignoreId?: string) {
    const serial = serialNumber.trim();
    if (!serial) throw new BadRequestException('Informe o número de série do inversor.');
    const existing = await this.prisma.inverter.findFirst({
      where: { plantId, serialNumber: serial, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
    });
    if (existing) throw new ConflictException('Já existe um inversor com este número de série nesta usina.');
  }
}
