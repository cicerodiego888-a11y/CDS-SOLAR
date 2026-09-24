import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateEquipmentDto, StatusDto, UpdateEquipmentDto } from '../common/dto';
import { isInverterLinkableEquipmentType } from '../integrations/integration-binding.identity';

const include = { plant: { include: { customer: true } }, inverter: true };

@Injectable()
export class EquipmentService {
  constructor(private prisma: PrismaService) {}

  findAll(filters?: { plantId?: string; type?: string; status?: string; inverterId?: string }) {
    return this.prisma.equipment.findMany({
      where: {
        ...(filters?.plantId ? { plantId: filters.plantId } : {}),
        ...(filters?.type ? { type: filters.type as never } : {}),
        ...(filters?.status ? { status: filters.status as never } : {}),
        ...(filters?.inverterId ? { inverterId: filters.inverterId } : {}),
      },
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.equipment.findUnique({ where: { id }, include });
    if (!item) throw new NotFoundException('Equipamento não encontrado.');
    return item;
  }

  async create(dto: CreateEquipmentDto) {
    await this.assertPlant(dto.plantId);
    const inverterId = this.resolveInverterId(dto.type, dto.inverterId);
    await this.assertInverter(dto.plantId, inverterId, dto.type);
    await this.assertSerial(dto.plantId, dto.serialNumber);
    return this.prisma.equipment.create({
      data: {
        plantId: dto.plantId,
        inverterId,
        type: dto.type,
        manufacturerName: dto.manufacturerName?.trim() || null,
        model: dto.model?.trim() || null,
        serialNumber: dto.serialNumber.trim(),
        notes: dto.notes?.trim() || null,
        status: dto.status ?? 'ACTIVE',
      },
      include,
    });
  }

  async update(id: string, dto: UpdateEquipmentDto) {
    const current = await this.findOne(id);
    const plantId = dto.plantId ?? current.plantId;
    const type = dto.type ?? current.type;
    if (dto.plantId) await this.assertPlant(dto.plantId);
    const inverterId = this.resolveInverterId(
      type,
      dto.inverterId !== undefined ? dto.inverterId : current.inverterId,
    );
    await this.assertInverter(plantId, inverterId, type);
    if (dto.serialNumber || dto.plantId) {
      await this.assertSerial(plantId, dto.serialNumber ?? current.serialNumber, id);
    }
    return this.prisma.equipment.update({
      where: { id },
      data: {
        ...(dto.plantId ? { plantId: dto.plantId } : {}),
        ...(dto.type ? { type: dto.type } : {}),
        inverterId,
        ...(dto.manufacturerName !== undefined ? { manufacturerName: dto.manufacturerName?.trim() || null } : {}),
        ...(dto.model !== undefined ? { model: dto.model?.trim() || null } : {}),
        ...(dto.serialNumber ? { serialNumber: dto.serialNumber.trim() } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
      include,
    });
  }

  async updateStatus(id: string, dto: StatusDto) {
    await this.findOne(id);
    return this.prisma.equipment.update({ where: { id }, data: { status: dto.status }, include });
  }

  private resolveInverterId(type: string, inverterId: string | null | undefined) {
    if (!isInverterLinkableEquipmentType(type)) return null;
    const value = inverterId?.trim();
    return value || null;
  }

  private async assertPlant(plantId: string) {
    const plant = await this.prisma.plant.findUnique({ where: { id: plantId } });
    if (!plant) throw new NotFoundException('Usina não encontrada.');
  }

  private async assertInverter(plantId: string, inverterId: string | null | undefined, type: string) {
    if (!inverterId) return;
    if (!isInverterLinkableEquipmentType(type)) {
      throw new BadRequestException('Este tipo de equipamento não pode ser associado a um inversor.');
    }
    const inverter = await this.prisma.inverter.findUnique({ where: { id: inverterId } });
    if (!inverter) throw new NotFoundException('Inversor não encontrado.');
    if (inverter.plantId !== plantId) {
      throw new BadRequestException('O inversor informado não pertence à usina selecionada.');
    }
  }

  private async assertSerial(plantId: string, serialNumber: string, ignoreId?: string) {
    const serial = serialNumber.trim();
    if (!serial) throw new BadRequestException('Informe o número de série do equipamento.');
    const existing = await this.prisma.equipment.findFirst({
      where: { plantId, serialNumber: serial, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
    });
    if (existing) throw new ConflictException('Já existe um equipamento com este número de série nesta usina.');
  }
}
