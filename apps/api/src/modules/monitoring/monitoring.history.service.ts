import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { JwtPayload } from '../auth/auth.types';
import { comparisonPercent, toNumber } from './monitoring.aggregation';
import { MonitoringAccessService } from './monitoring.access';
import { EnergyReading, aggregateEnergyHistory } from './monitoring.energy';
import {
  HISTORY_GRANULARITIES,
  HISTORY_PERIODS,
  HistoryGranularity,
  HistoryPeriod,
  MAX_HISTORY_DAYS,
  defaultGranularity,
  monitoringTimeZone,
  periodRange,
  previousPeriodRange,
  zonedDate,
} from './monitoring.timezone';

export type HistoryQuery = {
  period?: string;
  plantId?: string;
  inverterId?: string;
  startDate?: string;
  endDate?: string;
  granularity?: string;
};

type ReadingRow = EnergyReading & { powerKw?: unknown; communicationOk?: boolean };

@Injectable()
export class MonitoringHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MonitoringAccessService,
  ) {}

  async history(query: HistoryQuery, user: JwtPayload) {
    const parsed = this.parseQuery(query);
    if (parsed.plantId) await this.access.assertPlant(parsed.plantId, user);
    if (parsed.inverterId) {
      const inverter = await this.access.assertInverter(parsed.inverterId, user);
      if (parsed.plantId && inverter.plantId !== parsed.plantId) {
        throw new UnprocessableEntityException('O inversor não pertence à usina informada.');
      }
    }
    const plantWhere = await this.access.buildPlantWhere(user);
    return this.compute(parsed, { plantWhere });
  }

  async plantHistory(plantId: string, query: HistoryQuery, user: JwtPayload) {
    return this.history({ ...query, plantId }, user);
  }

  async inverterHistory(inverterId: string, query: HistoryQuery, user: JwtPayload) {
    return this.history({ ...query, inverterId }, user);
  }

  async compute(
    input: ReturnType<MonitoringHistoryService['parseQuery']>,
    scope?: string | null | { customerId?: string | null; plantWhere?: Prisma.PlantWhereInput },
  ) {
    const normalized =
      scope == null || typeof scope === 'string'
        ? { customerId: scope ?? null }
        : scope;
    const timeZone = monitoringTimeZone();
    const readings = await this.loadReadings(input.from, input.to, {
      plantId: input.plantId,
      inverterId: input.inverterId,
      customerId: normalized.customerId,
      plantWhere: normalized.plantWhere,
    });
    const current = aggregateEnergyHistory(readings, {
      from: input.from,
      to: input.to,
      granularity: input.granularity,
      timeZone,
    });
    const previousRange = previousPeriodRange(input.from, input.to);
    const previousReadings = await this.loadReadings(previousRange.from, previousRange.to, {
      plantId: input.plantId,
      inverterId: input.inverterId,
      customerId: normalized.customerId,
      plantWhere: normalized.plantWhere,
    });
    const previous = aggregateEnergyHistory(previousReadings, {
      from: previousRange.from,
      to: previousRange.to,
      granularity: input.granularity,
      timeZone,
    });

    return {
      timezone: timeZone,
      period: input.period,
      granularity: input.granularity,
      from: input.from.toISOString(),
      to: input.to.toISOString(),
      unit: { power: 'kW', energy: 'kWh', installed: 'kWp' },
      hasData: current.hasData,
      energyKwh: current.energyKwh,
      previousEnergyKwh: previous.hasData ? previous.energyKwh : null,
      comparisonPercent: comparisonPercent(current.energyKwh, previous.hasData ? previous.energyKwh : null),
      series: current.series,
      resets: current.resets,
      source: current.source,
      notes: [
        ...current.notes,
        ...(current.resets ? ['Reset de contador detectado; o valor menor não foi somado como geração.'] : []),
        'Disponibilidade e cobertura usam o serviço de saúde operacional, não este agregado de energia.',
      ],
      emptyMessage: current.hasData ? null : 'Não existem leituras para o período.',
      byPlant: current.byPlant,
      byInverter: current.byInverter,
    };
  }

  async latestReadings(filter: {
    plantId?: string;
    inverterId?: string;
    customerId?: string | null;
    plantWhere?: Prisma.PlantWhereInput;
  }) {
    const where: Prisma.MonitoringReadingWhereInput = {
      ...(filter.plantId ? { plantId: filter.plantId } : {}),
      ...(filter.inverterId ? { inverterId: filter.inverterId } : {}),
      ...(filter.plantWhere ? { plant: filter.plantWhere } : {}),
      ...(filter.customerId && !filter.plantWhere ? { plant: { customerId: filter.customerId } } : {}),
    };
    const rows = await this.prisma.monitoringReading.findMany({
      where,
      select: {
        plantId: true,
        inverterId: true,
        collectedAt: true,
        powerKw: true,
        energyTodayKwh: true,
        energyMonthKwh: true,
        energyTotalKwh: true,
        communicationOk: true,
      },
      orderBy: { collectedAt: 'desc' },
      take: 400,
    });
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const key = row.inverterId || `plant:${row.plantId}`;
      if (!latest.has(key)) latest.set(key, row);
    }
    return [...latest.values()];
  }

  parseQuery(query: HistoryQuery) {
    const period = HISTORY_PERIODS.includes(query.period as HistoryPeriod)
      ? query.period as HistoryPeriod
      : query.startDate && query.endDate ? 'custom' : 'today';
    const start = query.startDate ? this.parseDate(query.startDate) : undefined;
    const end = query.endDate ? this.parseDate(query.endDate) : undefined;
    if (period === 'custom' && (!start || !end)) {
      throw new UnprocessableEntityException('Informe startDate e endDate para o período personalizado.');
    }
    const timeZone = monitoringTimeZone();
    const range = periodRange(period, new Date(), timeZone, start && end ? { start, end } : undefined);
    if (range.from >= range.to) {
      throw new UnprocessableEntityException('Intervalo de datas inválido.');
    }
    const days = (range.to.getTime() - range.from.getTime()) / 86_400_000;
    if (days > MAX_HISTORY_DAYS) {
      throw new UnprocessableEntityException(`O intervalo máximo é de ${MAX_HISTORY_DAYS} dias.`);
    }
    const granularity = HISTORY_GRANULARITIES.includes(query.granularity as HistoryGranularity)
      ? query.granularity as HistoryGranularity
      : defaultGranularity(period, range.from, range.to);
    return {
      period,
      granularity,
      from: range.from,
      to: range.to,
      plantId: query.plantId?.trim() || undefined,
      inverterId: query.inverterId?.trim() || undefined,
    };
  }

  private async loadReadings(
    from: Date,
    to: Date,
    filter: {
      plantId?: string;
      inverterId?: string;
      customerId?: string | null;
      plantWhere?: Prisma.PlantWhereInput;
    },
  ): Promise<ReadingRow[]> {
    const where: Prisma.MonitoringReadingWhereInput = {
      collectedAt: { gte: from, lt: to },
      ...(filter.plantId ? { plantId: filter.plantId } : {}),
      ...(filter.inverterId ? { inverterId: filter.inverterId } : {}),
      ...(filter.plantWhere ? { plant: filter.plantWhere } : {}),
      ...(filter.customerId && !filter.plantWhere ? { plant: { customerId: filter.customerId } } : {}),
    };
    const rows = await this.prisma.monitoringReading.findMany({
      where,
      select: {
        plantId: true,
        inverterId: true,
        collectedAt: true,
        energyTotalKwh: true,
        energyTodayKwh: true,
        powerKw: true,
        communicationOk: true,
      },
      orderBy: { collectedAt: 'asc' },
    });
    const boundary = await this.loadBoundary(from, filter, rows);
    return [...boundary, ...rows];
  }

  private async loadBoundary(
    from: Date,
    filter: { plantId?: string; inverterId?: string; customerId?: string | null },
    rows: Array<{ inverterId: string | null }>,
  ): Promise<ReadingRow[]> {
    const inverterIds = [...new Set(rows.map((row) => row.inverterId).filter((id): id is string => Boolean(id)))];
    if (filter.inverterId) inverterIds.push(filter.inverterId);
    const unique = [...new Set(inverterIds)];
    if (!unique.length) return [];
    const previous = await this.prisma.$queryRaw<Array<{
      plantId: string;
      inverterId: string | null;
      collectedAt: Date;
      energyTotalKwh: Prisma.Decimal | null;
      energyTodayKwh: Prisma.Decimal | null;
      powerKw: Prisma.Decimal | null;
      communicationOk: boolean;
    }>>`
      SELECT DISTINCT ON ("inverterId")
        "plantId", "inverterId", "collectedAt", "energyTotalKwh", "energyTodayKwh", "powerKw", "communicationOk"
      FROM "MonitoringReading"
      WHERE "collectedAt" < ${from}
        AND "inverterId" IN (${Prisma.join(unique)})
      ORDER BY "inverterId", "collectedAt" DESC
    `;
    return previous;
  }

  private parseDate(value: string) {
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (day) {
      return zonedDate(monitoringTimeZone(), Number(day[1]), Number(day[2]), Number(day[3]));
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new UnprocessableEntityException('Data inválida.');
    }
    return parsed;
  }
}

export function sumLatestPowerKw(latest: Array<{ powerKw?: unknown }>) {
  const values = latest.map((item) => toNumber(item.powerKw as never));
  const present = values.filter((value): value is number => value !== null);
  return {
    valueKw: present.length ? Number(present.reduce((sum, value) => sum + value, 0).toFixed(3)) : null,
    hasData: present.length > 0,
  };
}

export function sumLatestEnergyField(
  latest: Array<Record<string, unknown>>,
  field: 'energyTodayKwh' | 'energyMonthKwh' | 'energyTotalKwh',
) {
  const values = latest.map((item) => toNumber(item[field] as never));
  const present = values.filter((value): value is number => value !== null);
  return {
    valueKwh: present.length ? Number(present.reduce((sum, value) => sum + value, 0).toFixed(3)) : null,
    hasData: present.length > 0,
  };
}

export function sumLatestEnergyTotal(latest: Array<{ energyTotalKwh?: unknown }>) {
  return sumLatestEnergyField(latest as Array<Record<string, unknown>>, 'energyTotalKwh');
}
