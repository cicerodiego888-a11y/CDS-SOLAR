import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { assertEnergyDocument, DOCUMENT_IN_USE_MESSAGE } from '../common/energy-document';
import { CreateCustomerConsumerDto, UpdateCustomerConsumerDto } from '../common/dto';
import { isPrismaUniqueError } from './customers.service';

@Injectable()
export class CustomerConsumerService {
  constructor(private prisma: PrismaService) {}

  async findByCustomer(customerId: string) {
    const customer = await this.requireCustomer(customerId);
    return customer.consumer ?? null;
  }

  async createForCustomer(customerId: string, dto: CreateCustomerConsumerDto) {
    const customer = await this.requireCustomer(customerId);
    if (customer.consumerId) {
      throw new ConflictException('Este cliente já possui cadastro energético.');
    }
    try {
      if (dto.consumerId?.trim()) {
        return await this.linkExisting(customerId, dto.consumerId.trim());
      }
      const parsed = assertEnergyDocument(dto.document, dto.documentType);
      const name = this.requireHolderName(dto.name);
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.customer.findUnique({ where: { id: customerId } });
        if (!current) throw new NotFoundException('Cliente não encontrado.');
        if (current.consumerId) throw new ConflictException('Este cliente já possui cadastro energético.');
        const existing = await tx.consumer.findUnique({ where: { document: parsed.document } });
        if (existing) throw new ConflictException(DOCUMENT_IN_USE_MESSAGE);
        const consumer = await tx.consumer.create({
          data: {
            name,
            document: parsed.document,
            documentType: parsed.documentType,
            email: dto.email?.trim() || null,
            phone: dto.phone?.trim() || null,
            status: 'ACTIVE',
          },
        });
        await tx.customer.update({
          where: { id: customerId },
          data: { consumerId: consumer.id },
        });
        return consumer;
      });
    } catch (error) {
      if (isPrismaUniqueError(error)) throw new ConflictException(DOCUMENT_IN_USE_MESSAGE);
      throw error;
    }
  }

  async updateForCustomer(customerId: string, dto: UpdateCustomerConsumerDto) {
    const customer = await this.requireCustomer(customerId);
    if (!customer.consumer) throw new NotFoundException('Cadastro energético não encontrado.');
    const consumer = customer.consumer;
    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException('Informe o nome do titular.');
    }
    const documentPatch = dto.document !== undefined || dto.documentType !== undefined
      ? assertEnergyDocument(dto.document ?? consumer.document, dto.documentType ?? consumer.documentType)
      : undefined;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (documentPatch) {
          const existing = await tx.consumer.findUnique({ where: { document: documentPatch.document } });
          if (existing && existing.id !== consumer.id) throw new ConflictException(DOCUMENT_IN_USE_MESSAGE);
        }
        return tx.consumer.update({
          where: { id: consumer.id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(documentPatch ?? {}),
            ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
          },
        });
      });
    } catch (error) {
      if (isPrismaUniqueError(error)) throw new ConflictException(DOCUMENT_IN_USE_MESSAGE);
      throw error;
    }
  }

  private async linkExisting(customerId: string, consumerId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.customer.findUnique({ where: { id: customerId } });
      if (!current) throw new NotFoundException('Cliente não encontrado.');
      if (current.consumerId && current.consumerId !== consumerId) {
        throw new ConflictException('Este cliente já possui cadastro energético.');
      }
      const consumer = await tx.consumer.findUnique({ where: { id: consumerId } });
      if (!consumer) throw new NotFoundException('Consumidor não encontrado.');
      const owner = await tx.customer.findFirst({ where: { consumerId } });
      if (owner && owner.id !== customerId) {
        throw new ConflictException('Este consumidor já está vinculado a outro cliente.');
      }
      if (current.consumerId !== consumerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: { consumerId },
        });
      }
      return consumer;
    });
  }

  private async requireCustomer(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { consumer: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado.');
    return customer;
  }

  private requireHolderName(name: string | undefined) {
    const trimmed = name?.trim() ?? '';
    if (!trimmed) throw new BadRequestException('Informe o nome do titular.');
    return trimmed;
  }
}
