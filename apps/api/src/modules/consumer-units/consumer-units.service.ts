import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { assertUtilityNumber, normalizeUtilityNumber, optionalContractAccount } from '../common/utility-number';
import { CreateConsumerUnitDto, StatusDto, UpdateConsumerUnitDto } from '../common/dto';
import { AccessScope, JwtPayload } from '../auth/auth.types';
import { AuthorizationService } from '../auth/authorization.service';

const include = {
  consumer: true,
  distributor: true,
} as const;

@Injectable()
export class ConsumerUnitsService {
  constructor(
    private prisma: PrismaService,
    private authorization: AuthorizationService,
  ) {}

  async findAll(
    filters: {
      number?: string;
      distributorId?: string;
      consumerId?: string;
      status?: string;
    } | undefined,
    user: JwtPayload,
  ) {
    const scope = await this.authorization.resolveAccessScope(user);
    // Escopo pelo Customer do titular (mesma regra de canAccessCustomer); vínculo Plant.consumerUnitId não concede acesso à listagem.
    if (!scope.unrestricted && scope.customerIds.length === 0) return [];
    const number = normalizeUtilityNumber(filters?.number) || filters?.number?.trim();
    return this.prisma.consumerUnit.findMany({
      where: {
        ...(number ? { number: { contains: number } } : {}),
        ...(filters?.distributorId ? { distributorId: filters.distributorId } : {}),
        ...(filters?.consumerId ? { consumerId: filters.consumerId } : {}),
        ...(filters?.status ? { status: filters.status as never } : {}),
        ...(scope.unrestricted ? {} : { consumer: { customer: { id: { in: scope.customerIds } } } }),
      },
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: JwtPayload) {
    const scope = await this.authorization.resolveAccessScope(user);
    return this.findOneInScope(id, scope);
  }

  private async findOneInScope(id: string, scope: AccessScope) {
    const item = await this.prisma.consumerUnit.findUnique({ where: { id }, include });
    // Fora do escopo responde como inexistente para não revelar a UC.
    if (!item || !(await this.canAccessConsumer(scope, item.consumerId))) {
      throw new NotFoundException('Unidade consumidora não encontrada.');
    }
    return item;
  }

  private async canAccessConsumer(scope: AccessScope, consumerId: string) {
    if (scope.unrestricted) return true;
    const customer = await this.prisma.customer.findUnique({ where: { consumerId }, select: { id: true } });
    return customer ? this.authorization.canAccessCustomer(scope, customer.id) : false;
  }

  async createForUser(dto: CreateConsumerUnitDto, user: JwtPayload) {
    const scope = await this.authorization.resolveAccessScope(user);
    // Titular inexistente e titular fora do escopo respondem igual para não revelar o Consumer.
    if (!(await this.canAccessConsumer(scope, dto.consumerId))) {
      throw new NotFoundException('Consumidor não encontrado.');
    }
    return this.create(dto);
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

  async update(id: string, dto: UpdateConsumerUnitDto, user: JwtPayload) {
    const scope = await this.authorization.resolveAccessScope(user);
    const current = await this.findOneInScope(id, scope);
    const consumerId = dto.consumerId ?? current.consumerId;
    const distributorId = dto.distributorId ?? current.distributorId;
    const number = dto.number !== undefined
      ? assertUtilityNumber(dto.number, 'o número da unidade consumidora')
      : current.number;
    const contractAccount = dto.contractAccount !== undefined
      ? optionalContractAccount(dto.contractAccount)
      : undefined;

    if (dto.consumerId) {
      await this.assertConsumer(dto.consumerId);
      if (!(await this.canAccessConsumer(scope, dto.consumerId))) {
        throw new NotFoundException('Consumidor não encontrado.');
      }
    }
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

  async updateStatus(id: string, dto: StatusDto, user: JwtPayload) {
    const scope = await this.authorization.resolveAccessScope(user);
    await this.findOneInScope(id, scope);
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
