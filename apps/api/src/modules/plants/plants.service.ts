import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePlantDto, LinkPlantConsumerUnitDto, PlantStatusDto, UpdatePlantDto } from '../common/dto';

const plantInclude = {
  customer: true,
  consumerUnitRef: { include: { distributor: true, consumer: true } },
} as const;

const plantDetailInclude = {
  customer: true,
  consumerUnitRef: { include: { distributor: true, consumer: true } },
  inverters: { include: { manufacturerRef: true } },
  equipment: true,
  alerts: { take: 20, orderBy: { occurredAt: 'desc' as const } },
  _count: { select: { inverters: true, equipment: true } },
} as const;

@Injectable()
export class PlantsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.plant.findMany({
      include: {
        customer: true,
        consumerUnitRef: { include: { distributor: true } },
        _count: { select: { inverters: true, equipment: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const plant = await this.prisma.plant.findUnique({
      where: { id },
      include: plantDetailInclude,
    });
    if (!plant) throw new NotFoundException('Usina não encontrada.');
    return plant;
  }

  async create(dto: CreatePlantDto) {
    await this.assertCustomer(dto.customerId);
    const link = dto.consumerUnitId
      ? await this.resolveLink(dto.customerId, dto.consumerUnitId)
      : null;
    return this.prisma.plant.create({
      data: {
        customerId: dto.customerId,
        name: dto.name.trim(),
        installedPowerKw: dto.installedPowerKw,
        distributor: link?.distributorName ?? (dto.distributor?.trim() || null),
        consumerUnit: link?.number ?? (dto.consumerUnit?.trim() || null),
        consumerUnitId: link?.id ?? null,
        address: dto.address?.trim() || null,
        status: dto.status ?? 'ACTIVE',
      },
      include: plantInclude,
    });
  }

  async update(id: string, dto: UpdatePlantDto) {
    const current = await this.findOne(id);
    const customerId = dto.customerId ?? current.customerId;
    if (dto.customerId) await this.assertCustomer(dto.customerId);

    let linkData: { consumerUnitId: string | null; distributor: string | null; consumerUnit: string | null } | undefined;
    if (dto.consumerUnitId !== undefined) {
      if (dto.consumerUnitId === null || dto.consumerUnitId === '') {
        linkData = {
          consumerUnitId: null,
          distributor: current.distributor,
          consumerUnit: current.consumerUnit,
        };
      } else {
        const link = await this.resolveLink(customerId, dto.consumerUnitId);
        linkData = {
          consumerUnitId: link.id,
          distributor: link.distributorName,
          consumerUnit: link.number,
        };
      }
    }

    return this.prisma.plant.update({
      where: { id },
      data: {
        ...(dto.customerId ? { customerId } : {}),
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.installedPowerKw !== undefined ? { installedPowerKw: dto.installedPowerKw } : {}),
        ...(linkData
          ? linkData
          : {
              ...(dto.distributor ? { distributor: dto.distributor.trim() } : {}),
              ...(dto.consumerUnit ? { consumerUnit: dto.consumerUnit.trim() } : {}),
            }),
        ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
      },
      include: plantInclude,
    });
  }

  async updateStatus(id: string, dto: PlantStatusDto) {
    await this.findOne(id);
    return this.prisma.plant.update({
      where: { id },
      data: { status: dto.status },
      include: plantInclude,
    });
  }

  async linkConsumerUnit(plantId: string, dto: LinkPlantConsumerUnitDto) {
    const plant = await this.findOne(plantId);
    const link = await this.resolveLink(plant.customerId, dto.consumerUnitId);
    return this.prisma.plant.update({
      where: { id: plantId },
      data: {
        consumerUnitId: link.id,
        consumerUnit: link.number,
        distributor: link.distributorName,
      },
      include: plantInclude,
    });
  }

  async unlinkConsumerUnit(plantId: string) {
    await this.findOne(plantId);
    return this.prisma.plant.update({
      where: { id: plantId },
      data: { consumerUnitId: null },
      include: plantInclude,
    });
  }

  private async resolveLink(customerId: string, consumerUnitId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Cliente não encontrado.');
    if (!customer.consumerId) {
      throw new BadRequestException('O cliente desta usina não possui consumidor energético vinculado.');
    }
    const unit = await this.prisma.consumerUnit.findUnique({
      where: { id: consumerUnitId },
      include: { distributor: true },
    });
    if (!unit) throw new NotFoundException('Unidade consumidora não encontrada.');
    if (unit.consumerId !== customer.consumerId) {
      throw new BadRequestException(
        'Esta unidade consumidora pertence a outro consumidor e não pode ser vinculada a esta usina.',
      );
    }
    return {
      id: unit.id,
      number: unit.number,
      distributorName: unit.distributor.name,
    };
  }

  private async assertCustomer(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Cliente não encontrado.');
  }
}
