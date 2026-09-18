import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePlantDto, PlantStatusDto, UpdatePlantDto } from '../common/dto';

@Injectable()
export class PlantsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.plant.findMany({
      include: {
        customer: true,
        _count: { select: { inverters: true, equipment: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const plant = await this.prisma.plant.findUnique({
      where: { id },
      include: {
        customer: true,
        inverters: { include: { manufacturerRef: true } },
        equipment: true,
        alerts: { take: 20, orderBy: { occurredAt: 'desc' } },
        _count: { select: { inverters: true, equipment: true } },
      },
    });
    if (!plant) throw new NotFoundException('Usina não encontrada.');
    return plant;
  }

  async create(dto: CreatePlantDto) {
    await this.assertCustomer(dto.customerId);
    return this.prisma.plant.create({
      data: {
        customerId: dto.customerId,
        name: dto.name.trim(),
        installedPowerKw: dto.installedPowerKw,
        distributor: dto.distributor?.trim() || null,
        consumerUnit: dto.consumerUnit?.trim() || null,
        address: dto.address?.trim() || null,
        status: dto.status ?? 'ACTIVE',
      },
      include: { customer: true },
    });
  }

  async update(id: string, dto: UpdatePlantDto) {
    await this.findOne(id);
    if (dto.customerId) await this.assertCustomer(dto.customerId);
    return this.prisma.plant.update({
      where: { id },
      data: {
        ...(dto.customerId ? { customerId: dto.customerId } : {}),
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.installedPowerKw !== undefined ? { installedPowerKw: dto.installedPowerKw } : {}),
        ...(dto.distributor ? { distributor: dto.distributor.trim() } : {}),
        ...(dto.consumerUnit ? { consumerUnit: dto.consumerUnit.trim() } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
      },
      include: { customer: true },
    });
  }

  async updateStatus(id: string, dto: PlantStatusDto) {
    await this.findOne(id);
    return this.prisma.plant.update({ where: { id }, data: { status: dto.status }, include: { customer: true } });
  }

  private async assertCustomer(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Cliente não encontrado.');
  }
}
