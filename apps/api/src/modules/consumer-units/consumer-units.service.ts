import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { assertUtilityNumber, normalizeUtilityNumber, optionalContractAccount } from '../common/utility-number';
import { CreateConsumerUnitDto, StatusDto, UpdateConsumerUnitDto } from '../common/dto';

const include = {
  consumer: true,
  distributor: true,
} as const;

@Injectable()
export class ConsumerUnitsService {
  constructor(private prisma: PrismaService) {}

  findAll(filters?: {
    number?: string;
    distributorId?: string;
    consumerId?: string;
    status?: string;
  }) {
    const number = normalizeUtilityNumber(filters?.number) || filters?.number?.trim();
    return this.prisma.consumerUnit.findMany({
      where: {
        ...(number ? { number: { contains: number } } : {}),
        ...(filters?.distributorId ? { distributorId: filters.distributorId } : {}),
        ...(filters?.consumerId ? { consumerId: filters.consumerId } : {}),
        ...(filters?.status ? { status: filters.status as never } : {}),
      },
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.consumerUnit.findUnique({ where: { id }, include });
    if (!item) throw new NotFoundException('Unidade consumidora não encontrada.');
    return item;
  }

  async create(dto: CreateConsumerUnitDto) {
    await this.assertConsumer(dto.consumerId);
    await this.assertDistributor(dto.distributorId);
    const number = assertUtilityNumber(dto.number, 'o número da unidade consumidora');
    const contractAccount = optionalContractAccount(dto.contractAccount);
    await this.assertUniqueNumber(dto.distributorId, number);
    return this.prisma.consumerUnit.create({
      data: {
        consumerId: dto.consumerId,
        distributorId: dto.distributorId,
        number,
        ...(contractAccount !== undefined ? { contractAccount } : {}),
        address: dto.address?.trim() || null,
        status: dto.status ?? 'ACTIVE',
      },
      include,
    });
  }

  async update(id: string, dto: UpdateConsumerUnitDto) {
    const current = await this.findOne(id);
    const consumerId = dto.consumerId ?? current.consumerId;
    const distributorId = dto.distributorId ?? current.distributorId;
    const number = dto.number !== undefined
      ? assertUtilityNumber(dto.number, 'o número da unidade consumidora')
      : current.number;
    const contractAccount = dto.contractAccount !== undefined
      ? optionalContractAccount(dto.contractAccount)
      : undefined;

    if (dto.consumerId) await this.assertConsumer(dto.consumerId);
    if (dto.distributorId) await this.assertDistributor(dto.distributorId);
    if (dto.number || dto.distributorId) {
      await this.assertUniqueNumber(distributorId, number, id);
    }

    return this.prisma.consumerUnit.update({
      where: { id },
      data: {
        ...(dto.consumerId ? { consumerId } : {}),
        ...(dto.distributorId ? { distributorId } : {}),
        ...(dto.number ? { number } : {}),
        ...(contractAccount !== undefined ? { contractAccount } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
      },
      include,
    });
  }

  async updateStatus(id: string, dto: StatusDto) {
    await this.findOne(id);
    return this.prisma.consumerUnit.update({
      where: { id },
      data: { status: dto.status },
      include,
    });
  }

  private async assertConsumer(consumerId: string) {
    const consumer = await this.prisma.consumer.findUnique({ where: { id: consumerId } });
    if (!consumer) throw new NotFoundException('Consumidor não encontrado.');
  }

  private async assertDistributor(distributorId: string) {
    const distributor = await this.prisma.distributor.findUnique({ where: { id: distributorId } });
    if (!distributor) throw new NotFoundException('Distribuidora não encontrada.');
  }

  private async assertUniqueNumber(distributorId: string, number: string, ignoreId?: string) {
    const existing = await this.prisma.consumerUnit.findUnique({
      where: {
        distributorId_number: {
          distributorId,
          number,
        },
      },
    });
    if (existing && existing.id !== ignoreId) {
      throw new ConflictException('Já existe uma UC com este número nesta distribuidora.');
    }
  }
}
