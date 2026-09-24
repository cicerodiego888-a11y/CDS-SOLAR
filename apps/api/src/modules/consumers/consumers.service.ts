import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { assertEnergyDocument, DOCUMENT_IN_USE_MESSAGE, normalizeDocument } from '../common/energy-document';
import { CreateConsumerDto, StatusDto, UpdateConsumerDto } from '../common/dto';

@Injectable()
export class ConsumersService {
  constructor(private prisma: PrismaService) {}

  findAll(filters?: { name?: string; document?: string; status?: string }) {
    const name = filters?.name?.trim();
    const document = normalizeDocument(filters?.document) || filters?.document?.trim();
    return this.prisma.consumer.findMany({
      where: {
        ...(name ? { name: { contains: name, mode: 'insensitive' } } : {}),
        ...(document ? { document: { contains: document } } : {}),
        ...(filters?.status ? { status: filters.status as never } : {}),
      },
      include: { _count: { select: { consumerUnits: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.consumer.findUnique({
      where: { id },
      include: {
        consumerUnits: {
          include: { distributor: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { consumerUnits: true } },
      },
    });
    if (!item) throw new NotFoundException('Consumidor não encontrado.');
    return item;
  }

  async create(dto: CreateConsumerDto) {
    const parsed = assertEnergyDocument(dto.document, dto.documentType);
    await this.assertUniqueDocument(parsed.document);
    return this.prisma.consumer.create({
      data: {
        name: dto.name.trim(),
        document: parsed.document,
        documentType: parsed.documentType,
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        status: dto.status ?? 'ACTIVE',
      },
    });
  }

  async update(id: string, dto: UpdateConsumerDto) {
    const current = await this.findOne(id);
    const documentPatch = dto.document !== undefined || dto.documentType !== undefined
      ? assertEnergyDocument(dto.document ?? current.document, dto.documentType ?? current.documentType)
      : undefined;
    if (documentPatch) await this.assertUniqueDocument(documentPatch.document, id);
    return this.prisma.consumer.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(documentPatch ?? {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
      },
    });
  }

  async updateStatus(id: string, dto: StatusDto) {
    await this.findOne(id);
    return this.prisma.consumer.update({ where: { id }, data: { status: dto.status } });
  }

  private async assertUniqueDocument(document: string, ignoreId?: string) {
    const existing = await this.prisma.consumer.findUnique({
      where: { document: document.trim() },
    });
    if (existing && existing.id !== ignoreId) {
      throw new ConflictException(DOCUMENT_IN_USE_MESSAGE);
    }
  }
}
