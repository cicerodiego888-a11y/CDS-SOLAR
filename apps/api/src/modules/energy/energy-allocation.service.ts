import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { EnergyRateioVersionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { JwtPayload } from '../auth/auth.types';
import { MonitoringAccessService } from '../monitoring/monitoring.access';
import { MonitoringHistoryService } from '../monitoring/monitoring.history.service';
import { defaultGranularity, monitoringTimeZone } from '../monitoring/monitoring.timezone';
import { allocateGenerationKwh, energyToScaled, sumEnergyStrings } from './allocation.math';
import { EnergyPeriodQuery } from './energy-management.service';
import { assertPercentagesSum100 } from './rateio.percentage';

const VERSION_INCLUDE = {
  lines: {
    include: {
      consumerUnit: {
        select: {
          id: true,
          number: true,
          contractAccount: true,
          status: true,
          consumerId: true,
        },
      },
      consumer: { select: { id: true, name: true } },
    },
    orderBy: { consumerUnit: { number: 'asc' as const } },
  },
} as const;

type RateioVersionRow = Prisma.EnergyRateioVersionGetPayload<{ include: typeof VERSION_INCLUDE }>;

/**
 * Motor de Alocação Energética (kWh).
 * generationKwh × percentage/100 = allocatedKwh
 * Calculado sob demanda — sem persistência neste Sprint.
 * Não calcula compensação, crédito, saldo ou faturamento.
 */
@Injectable()
export class EnergyAllocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MonitoringAccessService,
    private readonly history: MonitoringHistoryService,
  ) {}

  async plantAllocations(plantId: string, query: EnergyPeriodQuery, user: JwtPayload) {
    const plant = await this.access.assertPlant(plantId, user);
    const parsed = this.history.parseQuery({ ...query, plantId });
    const from = parsed.from;
    const to = parsed.to;
    const timezone = monitoringTimeZone();

    const versions = await this.loadApplicableVersions(plantId, from, to);
    if (!versions.length) {
      const generationProbe = await this.loadGeneration(plantId, from, to, parsed.period);
      return this.emptyResponse(plant, parsed, timezone, generationProbe, 'NO_RATEIO');
    }

    const segments = this.segmentPeriod(from, to, versions);
    const segmentResults = [];
    for (const segment of segments) {
      const generation = await this.loadGeneration(plantId, segment.from, segment.to, parsed.period);
      segmentResults.push(this.allocateSegment(segment, generation));
    }

    const hasGenerationData = segmentResults.some((item) => item.hasData);
    const generationTotal = hasGenerationData
      ? sumEnergyStrings(segmentResults.filter((item) => item.hasData).map((item) => item.generationKwh!))
      : null;

    const aggregated = this.aggregateByUc(segmentResults);
    const allocatedTotal = aggregated.length
      ? sumEnergyStrings(aggregated.map((item) => item.allocatedKwh))
      : null;

    if (hasGenerationData && generationTotal !== null && allocatedTotal !== null) {
      if (energyToScaled(generationTotal) !== energyToScaled(allocatedTotal)) {
        throw new UnprocessableEntityException('Invariante violada: soma das alocações ≠ geração.');
      }
    }

    return {
      domain: 'ENERGY_ALLOCATION' as const,
      plantId: plant.id,
      plantName: plant.name,
      period: {
        key: parsed.period,
        from: from.toISOString(),
        to: to.toISOString(),
      },
      timezone,
      hasData: hasGenerationData && aggregated.length > 0,
      generationKwh: hasGenerationData ? generationTotal : null,
      generationUnit: 'kWh' as const,
      allocatedTotalKwh: hasGenerationData && aggregated.length ? allocatedTotal : null,
      allocations: hasGenerationData ? aggregated : [],
      segments: segmentResults,
      emptyMessage: this.emptyMessage(hasGenerationData, versions.length, aggregated.length),
      notes: [
        'Este Sprint implementa apenas ALOCAÇÃO ENERGÉTICA.',
        'Compensação, Créditos, Saldo e Faturamento permanecem fora do escopo.',
        'Geração ← MonitoringHistory (energyTotalKwh/energyTodayKwh). Sem conversão kW→kWh.',
        'Rateio ← EnergyRateioVersion/Line. Plant.consumerUnit legado não é usado.',
        'Alocação calculada sob demanda (não persistida).',
        'Ausência de geração ≠ geração zero.',
      ],
    };
  }

  private async loadGeneration(plantId: string, from: Date, to: Date, _periodKey: string) {
    const granularity = defaultGranularity('custom', from, to);
    return this.history.compute({
      period: 'custom',
      granularity,
      from,
      to,
      plantId,
      inverterId: undefined,
    });
  }

  private emptyResponse(
    plant: { id: string; name: string },
    parsed: { period: string; from: Date; to: Date },
    timezone: string,
    generationProbe: { hasData: boolean; energyKwh: number | null },
    reason: 'NO_RATEIO' | 'NO_GENERATION',
  ) {
    const hasGeneration = Boolean(generationProbe.hasData);
    return {
      domain: 'ENERGY_ALLOCATION' as const,
      plantId: plant.id,
      plantName: plant.name,
      period: {
        key: parsed.period,
        from: parsed.from.toISOString(),
        to: parsed.to.toISOString(),
      },
      timezone,
      hasData: false,
      generationKwh: hasGeneration ? String(generationProbe.energyKwh ?? '0') : null,
      generationUnit: 'kWh' as const,
      allocatedTotalKwh: null,
      allocations: [],
      segments: [],
      emptyMessage:
        reason === 'NO_RATEIO'
          ? 'Sem Rateio ACTIVE aplicável ao período. Alocação não calculada.'
          : 'Sem geração disponível para o período.',
      reason,
      notes: [
        'Este Sprint implementa apenas ALOCAÇÃO ENERGÉTICA.',
        'Ausência de geração ≠ geração zero.',
      ],
    };
  }

  private emptyMessage(hasGeneration: boolean, versionCount: number, allocationCount: number) {
    if (!hasGeneration) return 'Sem geração disponível para o período.';
    if (!versionCount) return 'Sem Rateio ACTIVE aplicável ao período.';
    if (!allocationCount) return 'Geração presente, mas sem linhas de alocação.';
    return null;
  }

  private async loadApplicableVersions(plantId: string, from: Date, to: Date) {
    const versions = await this.prisma.energyRateioVersion.findMany({
      where: {
        plantId,
        status: EnergyRateioVersionStatus.ACTIVE,
        validFrom: { lt: to },
        OR: [{ validTo: null }, { validTo: { gt: from } }],
      },
      include: VERSION_INCLUDE,
      orderBy: { validFrom: 'asc' },
    });
    return versions;
  }

  private segmentPeriod(from: Date, to: Date, versions: RateioVersionRow[]) {
    const boundaries = new Set<number>([from.getTime(), to.getTime()]);
    for (const version of versions) {
      if (version.validFrom > from && version.validFrom < to) {
        boundaries.add(version.validFrom.getTime());
      }
      if (version.validTo && version.validTo > from && version.validTo < to) {
        boundaries.add(version.validTo.getTime());
      }
    }
    const points = [...boundaries].sort((a, b) => a - b);
    const segments: Array<{ from: Date; to: Date; version: RateioVersionRow }> = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const segFrom = new Date(points[i]);
      const segTo = new Date(points[i + 1]);
      if (!(segFrom < segTo)) continue;
      const version = versions.find((item) => (
        item.validFrom <= segFrom
        && (item.validTo == null || item.validTo > segFrom)
      ));
      if (!version) continue;
      segments.push({ from: segFrom, to: segTo, version });
    }
    return segments;
  }

  private allocateSegment(
    segment: { from: Date; to: Date; version: RateioVersionRow },
    generation: { hasData: boolean; energyKwh: number | null; source?: string },
  ) {
    const lines = segment.version.lines;
    const percentages = lines.map((line) => line.percentage.toString());
    try {
      assertPercentagesSum100(percentages);
    } catch {
      throw new UnprocessableEntityException(
        `Rateio ${segment.version.versionNumber} não totaliza 100% — alocação recusada.`,
      );
    }

    if (!generation.hasData || generation.energyKwh === null || generation.energyKwh === undefined) {
      return {
        from: segment.from.toISOString(),
        to: segment.to.toISOString(),
        rateioVersionId: segment.version.id,
        rateioVersionNumber: segment.version.versionNumber,
        rateioLabel: `V${segment.version.versionNumber}`,
        hasData: false,
        generationKwh: null as string | null,
        generationSource: generation.source ?? null,
        allocations: [] as Array<{
          consumerUnitId: string;
          consumerUnitNumber: string;
          consumerId: string;
          consumerName: string;
          percentage: string;
          allocatedKwh: string;
        }>,
      };
    }

    // Geração zero REAL (hasData + 0) é distinta de ausência — calcula alocações 0.
    const genStr = String(generation.energyKwh);
    const allocated = allocateGenerationKwh(genStr, percentages);
    return {
      from: segment.from.toISOString(),
      to: segment.to.toISOString(),
      rateioVersionId: segment.version.id,
      rateioVersionNumber: segment.version.versionNumber,
      rateioLabel: `V${segment.version.versionNumber}`,
      hasData: true,
      generationKwh: genStr,
      generationSource: generation.source ?? null,
      allocations: lines.map((line, index) => ({
        consumerUnitId: line.consumerUnitId,
        consumerUnitNumber: line.consumerUnit.number,
        consumerId: line.consumerId,
        consumerName: line.consumer.name,
        percentage: line.percentage.toString(),
        allocatedKwh: allocated[index],
        rateioVersionId: segment.version.id,
      })),
    };
  }

  private aggregateByUc(
    segments: Array<{
      hasData: boolean;
      allocations: Array<{
        consumerUnitId: string;
        consumerUnitNumber: string;
        consumerId: string;
        consumerName: string;
        percentage: string;
        allocatedKwh: string;
        rateioVersionId?: string;
      }>;
    }>,
  ) {
    const map = new Map<string, {
      consumerUnitId: string;
      consumerUnitNumber: string;
      consumerId: string;
      consumerName: string;
      percentages: string[];
      allocatedParts: string[];
      rateioVersionIds: string[];
    }>();

    for (const segment of segments) {
      if (!segment.hasData) continue;
      for (const line of segment.allocations) {
        const current = map.get(line.consumerUnitId) ?? {
          consumerUnitId: line.consumerUnitId,
          consumerUnitNumber: line.consumerUnitNumber,
          consumerId: line.consumerId,
          consumerName: line.consumerName,
          percentages: [],
          allocatedParts: [],
          rateioVersionIds: [],
        };
        current.percentages.push(line.percentage);
        current.allocatedParts.push(line.allocatedKwh);
        if (line.rateioVersionId) current.rateioVersionIds.push(line.rateioVersionId);
        map.set(line.consumerUnitId, current);
      }
    }

    return [...map.values()].map((item) => ({
      consumerUnitId: item.consumerUnitId,
      consumerUnitNumber: item.consumerUnitNumber,
      consumerId: item.consumerId,
      consumerName: item.consumerName,
      // percentual exibido: único se constante; senão "misto"
      percentage: item.percentages.every((value) => value === item.percentages[0])
        ? item.percentages[0]
        : 'MIXED',
      allocatedKwh: sumEnergyStrings(item.allocatedParts),
      unit: 'kWh' as const,
      rateioVersionIds: [...new Set(item.rateioVersionIds)],
    }));
  }
}
