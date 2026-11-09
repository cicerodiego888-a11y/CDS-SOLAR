import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { JwtPayload } from '../auth/auth.types';
import { AuthorizationService } from '../auth/authorization.service';
import { CreateCustomerConsumerUnitDto } from '../common/dto';
import { ConsumerUnitsService } from '../consumer-units/consumer-units.service';

const include = {
  consumer: true,
  distributor: true,
} as const;

@Injectable()
export class CustomerConsumerUnitsService {
  constructor(
    private prisma: PrismaService,
    private consumerUnits: ConsumerUnitsService,
    private authorization: AuthorizationService,
  ) {}

  async listByCustomer(customerId: string, user: JwtPayload) {
    const customer = await this.requireCustomerInScope(customerId, user);
    if (!customer.consumerId) return [];
    return this.prisma.consumerUnit.findMany({
      where: { consumerId: customer.consumerId },
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createForCustomer(customerId: string, dto: CreateCustomerConsumerUnitDto, user: JwtPayload) {
    const customer = await this.requireCustomerInScope(customerId, user);
    if (!customer.consumerId) {
      throw new BadRequestException('Cadastre o consumidor energético do cliente antes de criar uma unidade consumidora.');
    }
    // O titular vem do próprio Customer da URL (Customer.consumerId é único); o DTO não aceita consumerId.
    return this.consumerUnits.createForUser({
      consumerId: customer.consumerId,
      distributorId: dto.distributorId,
      number: dto.number,
      contractAccount: dto.contractAccount,
      address: dto.address,
      status: dto.status,
    }, user);
  }

  private async requireCustomerInScope(id: string, user: JwtPayload) {
    const scope = await this.authorization.resolveAccessScope(user);
    // Customer fora do escopo responde como inexistente, sem consultar o banco.
    if (!this.authorization.canAccessCustomer(scope, id)) throw new NotFoundException('Cliente não encontrado.');
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { consumer: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado.');
    return customer;
  }
}
