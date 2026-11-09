import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EnergyRateioVersionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { JwtPayload } from '../auth/auth.types';
import { MonitoringAccessService } from '../monitoring/monitoring.access';
import {
  assertPercentageLine,
  assertPercentagesSum100,
  intervalsOverlap,
  percentageToScaled,
  scaledToPercentageString,
} from './rateio.percentage';

export type RateioLineInput = {
  consumerUnitId: string;
  consumerId: string;
  percentage: string | number;
};

export type CreateRateioVersionInput = {
  validFrom: string;
  validTo?: string | null;
  modality?: string | null;
  reason?: string | null;
  lines: RateioLineInput[];
};

const LINE_INCLUDE = {
  consumerUnit: {
    select: {
      id: true,
      number: true,
      contractAccount: true,
      status: true,
      consumerId: true,
      distributor: { select: { id: true, name: true, code: true } },
    },
  },
  consumer: { select: { id: true, name: true, document: true, status: true } },
} as const;

const VERSION_INCLUDE = {
  lines: {
    include: LINE_INCLUDE,
    orderBy: { consumerUnit: { number: 'asc' as const } },
  },
  plant: { select: { id: true, name: true, status: true, customerId: true } },
} as const;

/**
 * Motor de Rateio Versionado.
 * Persistência de regras de distribuição (%). Não calcula kWh, crédito, compensação ou saldo.
 */
@Injectable()
export class RateioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MonitoringAccessService,
  ) {}

  async list(plantId: string, user: JwtPayload) {
    await this.access.assertPlant(plantId, user);
    const versions = await this.prisma.energyRateioVersion.findMany({
      where: { plantId },
      include: VERSION_INCLUDE,
      orderBy: { versionNumber: 'desc' },
    });
    return {
      domain: 'ENERGY_RATEIO' as const,
      plantId,
      versions: versions.map((item) => this.mapVersion(item)),
      notes: this.domainNotes(),
    };
  }

  async current(plantId: string, user: JwtPayload, at?: string) {
    await this.access.assertPlant(plantId, user);
    const instant = at ? this.parseDate(at, 'at') : new Date();
    const version = await this.findCovering(plantId, instant);
    return {
      domain: 'ENERGY_RATEIO' as const,
      plantId,
      at: instant.toISOString(),
      hasData: Boolean(version),
      rateio: version ? this.mapVersion(version) : null,
      emptyMessage: version ? null : 'Sem Rateio vigente para o instante informado.',
      notes: this.domainNotes(),
    };
  }

  async history(plantId: string, user: JwtPayload) {
    const listed = await this.list(plantId, user);
    return {
      ...listed,
      view: 'HISTORY' as const,
    };
  }

  async create(plantId: string, dto: CreateRateioVersionInput, user: JwtPayload) {
    const plant = await this.access.assertPlant(plantId, user);
    this.assertPlantMutable(plant.status);
    return this.persistNewVersion(plantId, dto, user, null);
  }

  async newVersion(
    plantId: string,
    rateioId: string,
    dto: CreateRateioVersionInput,
    user: JwtPayload,
  ) {
    const plant = await this.access.assertPlant(plantId, user);
    this.assertPlantMutable(plant.status);
    const previous = await this.prisma.energyRateioVersion.findFirst({
      where: { id: rateioId, plantId },
    });
    if (!previous) throw new NotFoundException('Versão de Rateio não encontrada.');
    if (previous.status === EnergyRateioVersionStatus.CANCELLED) {
      throw new UnprocessableEntityException('Não é possível versionar a partir de uma versão cancelada.');
    }
    return this.persistNewVersion(plantId, dto, user, previous.id);
  }

  async cancel(plantId: string, rateioId: string, user: JwtPayload) {
    const plant = await this.access.assertPlant(plantId, user);
    this.assertPlantMutable(plant.status);
    const version = await this.prisma.energyRateioVersion.findFirst({
      where: { id: rateioId, plantId },
      include: VERSION_INCLUDE,
    });
    if (!version) throw new NotFoundException('Versão de Rateio não encontrada.');
    if (version.status === EnergyRateioVersionStatus.CANCELLED) {
      return this.mapVersion(version);
    }
    const now = new Date();
    if (version.validTo && version.validTo <= now) {
      throw new UnprocessableEntityException('Versão histórica encerrada não pode ser cancelada; permanece no histórico.');
    }
    const updated = await this.prisma.energyRateioVersion.update({
      where: { id: version.id },
      data: {
        status: EnergyRateioVersionStatus.CANCELLED,
        validTo: version.validTo && version.validTo < now ? version.validTo : now,
      },
      include: VERSION_INCLUDE,
    });
    return this.mapVersion(updated);
  }

  private async persistNewVersion(
    plantId: string,
    dto: CreateRateioVersionInput,
    user: JwtPayload,
    previousId: string | null,
  ) {
    const validFrom = this.parseDate(dto.validFrom, 'validFrom');
    const validTo = dto.validTo ? this.parseDate(dto.validTo, 'validTo') : null;
    if (validTo && !(validFrom < validTo)) {
      throw new UnprocessableEntityException('Vigência inválida: validTo deve ser posterior a validFrom.');
    }
    if (!dto.lines?.length) {
      throw new BadRequestException('Informe ao menos uma linha de Rateio.');
    }

    const unitIds = dto.lines.map((line) => line.consumerUnitId);
    if (new Set(unitIds).size !== unitIds.length) {
      throw new BadRequestException('ConsumerUnit duplicada na mesma versão.');
    }

    try {
      assertPercentagesSum100(dto.lines.map((line) => line.percentage));
    } catch (error) {
      throw this.mapPercentageError(error);
    }

    const units = await this.prisma.consumerUnit.findMany({
      where: { id: { in: unitIds } },
      include: { consumer: { select: { id: true, name: true, status: true } } },
    });
    if (units.length !== unitIds.length) {
      throw new NotFoundException('Uma ou mais Unidades Consumidoras não foram encontradas.');
    }

    for (const line of dto.lines) {
      const unit = units.find((item) => item.id === line.consumerUnitId)!;
      if (unit.status !== 'ACTIVE') {
        throw new UnprocessableEntityException(`UC ${unit.number} está inativa.`);
      }
      if (unit.consumerId !== line.consumerId) {
        throw new UnprocessableEntityException(
          'ConsumerUnit não pertence ao Consumer informado.',
        );
      }
      if (unit.consumer.status !== 'ACTIVE') {
        throw new UnprocessableEntityException('Consumidor da UC está inativo.');
      }
      try {
        assertPercentageLine(line.percentage);
      } catch (error) {
        throw this.mapPercentageError(error);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Lock da Plant evita duas versões conflitantes concorrentes.
      await tx.$queryRaw`SELECT id FROM "Plant" WHERE id = ${plantId} FOR UPDATE`;

      const existing = await tx.energyRateioVersion.findMany({
        where: {
          plantId,
          status: EnergyRateioVersionStatus.ACTIVE,
        },
        orderBy: { versionNumber: 'asc' },
      });

      const openToClose = previousId
        ? existing.find((item) => item.id === previousId && item.validTo == null && item.validFrom < validFrom)
        : existing.find((item) => item.validTo == null && item.validFrom < validFrom);

      for (const item of existing) {
        const effectiveTo =
          openToClose && item.id === openToClose.id ? validFrom : item.validTo;
        if (intervalsOverlap(item.validFrom, effectiveTo, validFrom, validTo)) {
          throw new ConflictException(
            'Sobreposição de vigência com outra versão ACTIVE da mesma Usina.',
          );
        }
      }

      if (openToClose) {
        await tx.energyRateioVersion.update({
          where: { id: openToClose.id },
          data: { validTo: validFrom },
        });
      }

      const last = await tx.energyRateioVersion.findFirst({
        where: { plantId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      const versionNumber = (last?.versionNumber ?? 0) + 1;

      const created = await tx.energyRateioVersion.create({
        data: {
          plantId,
          versionNumber,
          validFrom,
          validTo,
          status: EnergyRateioVersionStatus.ACTIVE,
          modality: dto.modality?.trim() || null,
          reason: dto.reason?.trim() || null,
          createdBy: user.sub,
          lines: {
            create: dto.lines.map((line) => ({
              consumerUnitId: line.consumerUnitId,
              consumerId: line.consumerId,
              percentage: new Prisma.Decimal(scaledToPercentageString(percentageToScaled(line.percentage))),
            })),
          },
        },
        include: VERSION_INCLUDE,
      });

      return this.mapVersion(created);
    });
  }

  private async findCovering(plantId: string, instant: Date) {
    const versions = await this.prisma.energyRateioVersion.findMany({
      where: {
        plantId,
        status: EnergyRateioVersionStatus.ACTIVE,
        validFrom: { lte: instant },
        OR: [{ validTo: null }, { validTo: { gt: instant } }],
      },
      include: VERSION_INCLUDE,
      orderBy: { validFrom: 'desc' },
      take: 1,
    });
    return versions[0] ?? null;
  }

  private mapVersion(version: {
    id: string;
    plantId: string;
    versionNumber: number;
    validFrom: Date;
    validTo: Date | null;
    status: EnergyRateioVersionStatus;
    modality: string | null;
    reason: string | null;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    plant?: { id: string; name: string; status: string; customerId: string };
    lines: Array<{
      id: string;
      consumerUnitId: string;
      consumerId: string;
      percentage: Prisma.Decimal;
      consumerUnit: {
        id: string;
        number: string;
        contractAccount: string | null;
        status: string;
        distributor: { id: string; name: string; code: string };
      };
      consumer: { id: string; name: string; document: string; status: string };
    }>;
  }) {
    const now = new Date();
    const totalScaled = version.lines.reduce(
      (sum, line) => sum + percentageToScaled(line.percentage.toString()),
      0n,
    );
    const derivedStatus =
      version.status === EnergyRateioVersionStatus.CANCELLED
        ? 'CANCELLED'
        : version.validTo && version.validTo <= now
          ? 'EXPIRED'
          : version.validFrom > now
            ? 'SCHEDULED'
            : 'ACTIVE';

    return {
      id: version.id,
      plantId: version.plantId,
      plantName: version.plant?.name,
      versionNumber: version.versionNumber,
      label: `V${version.versionNumber}`,
      validFrom: version.validFrom.toISOString(),
      validTo: version.validTo?.toISOString() ?? null,
      status: version.status,
      derivedStatus,
      modality: version.modality,
      reason: version.reason,
      createdBy: version.createdBy,
      createdAt: version.createdAt.toISOString(),
      updatedAt: version.updatedAt.toISOString(),
      totalPercentage: scaledToPercentageString(totalScaled),
      totalIs100: totalScaled === 1_000_000n,
      lines: version.lines.map((line) => ({
        id: line.id,
        consumerUnitId: line.consumerUnitId,
        consumerUnitNumber: line.consumerUnit.number,
        contractAccount: line.consumerUnit.contractAccount,
        distributor: line.consumerUnit.distributor,
        consumerId: line.consumerId,
        consumerName: line.consumer.name,
        percentage: line.percentage.toString(),
        percentageUnit: '%' as const,
        // Colunas futuras (Sprint 9/11+) — sem cálculo
        consumption: null,
        compensated: null,
        credit: null,
        balance: null,
      })),
      notes: this.domainNotes(),
    };
  }

  private assertPlantMutable(status: string) {
    if (status === 'INACTIVE') {
      throw new UnprocessableEntityException('Usina inativa: mutações de Rateio bloqueadas.');
    }
  }

  private parseDate(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Data inválida em ${field}.`);
    }
    return date;
  }

  private mapPercentageError(error: unknown): Error {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PERCENTAGE_NON_POSITIVE' || code === 'PERCENTAGE_INVALID_FORMAT') {
      return new BadRequestException('Percentual inválido: deve ser maior que zero.');
    }
    if (code === 'PERCENTAGE_GT_100') {
      return new BadRequestException('Percentual inválido: não pode exceder 100%.');
    }
    if (code === 'PERCENTAGE_SUM_NOT_100') {
      return new UnprocessableEntityException('O rateio deve totalizar 100%.');
    }
    return error instanceof Error ? error : new BadRequestException('Percentual inválido.');
  }

  private domainNotes() {
    return [
      'Rateio representa uma regra de distribuição. Não representa, por si só, energia compensada, crédito ou saldo.',
      'Regra operacional B7: composição ACTIVE de uma versão deve totalizar 100%.',
      'Percentual não é kWh. Geração ≠ Rateio. Consumo ≠ Rateio.',
      'Histórico é imutável: alterações criam nova versão.',
      'Plant.consumerUnit (legacy) não é usado como vínculo de Rateio.',
    ];
  }
}
