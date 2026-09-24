import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
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
  ) {}

  async listByCustomer(customerId: string) {
    const customer = await this.requireCustomerWithConsumer(customerId);
    if (!customer.consumerId) return [];
    return this.prisma.consumerUnit.findMany({
      where: { consumerId: customer.consumerId },
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createForCustomer(customerId: string, dto: CreateCustomerConsumerUnitDto) {
    const customer = await this.requireCustomerWithConsumer(customerId);
    if (!customer.consumerId) {
      throw new BadRequestException('Cadastre o consumidor energético do cliente antes de criar uma unidade consumidora.');
    }
    return this.consumerUnits.create({
      consumerId: customer.consumerId,
      distributorId: dto.distributorId,
      number: dto.number,
      contractAccount: dto.contractAccount,
      address: dto.address,
      status: dto.status,
    });
  }

  private async requireCustomerWithConsumer(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { consumer: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado.');
    return customer;
  }
}
