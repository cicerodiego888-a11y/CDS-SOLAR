import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../auth/authorization.service';
import { JwtPayload } from '../auth/auth.types';
import { MonitoringAccessService } from '../monitoring/monitoring.access';
import { MonitoringHistoryService } from '../monitoring/monitoring.history.service';
import { monitoringTimeZone } from '../monitoring/monitoring.timezone';
import { EnergyPeriodQuery } from './energy-management.service';
import { EnergyConsumptionStore, NormalizedConsumptionRecord } from './energy-consumption.store';

const UC_INCLUDE = {
  consumer: { include: { customer: { select: { id: true, name: true } } } },
  distributor: { select: { id: true, name: true, code: true } },
  plants: { select: { id: true, name: true, customerId: true } },
} as const;

/**
 * Consumo energético por ConsumerUnit.
 * NÃO deriva consumo de geração. NÃO calcula compensação/crédito/rateio.
 */
@Injectable()
export class EnergyConsumptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly access: MonitoringAccessService,
    private readonly history: MonitoringHistoryService,
    private readonly store: EnergyConsumptionStore,
  ) {}

  async consumerUnitSummary(consumerUnitId: string, query: EnergyPeriodQuery, user: JwtPayload) {
    const unit = await this.assertConsumerUnitAccess(consumerUnitId, user);
    const range = this.resolvePeriod(query);
    const record = await this.store.findForPeriod(unit.id, range.from, range.to);
    return this.toConsumptionResponse(unit, range, record, false);
  }

  async consumerUnitConsumption(consumerUnitId: string, query: EnergyPeriodQuery, user: JwtPayload) {
    const unit = await this.assertConsumerUnitAccess(consumerUnitId, user);
    const range = this.resolvePeriod(query);
    const record = await this.store.findForPeriod(unit.id, range.from, range.to);
    return this.toConsumptionResponse(unit, range, record, true);
  }

  async plantConsumerUnitsConsumption(plantId: string, query: EnergyPeriodQuery, user: JwtPayload) {
    const plant = await this.access.assertPlant(plantId, user);
    const range = this.resolvePeriod(query);
    const linked = await this.prisma.consumerUnit.findMany({
      where: { plants: { some: { id: plantId } } },
      include: UC_INCLUDE,
      orderBy: { number: 'asc' },
    });

    const items = [];
    for (const unit of linked) {
      const record = await this.store.findForPeriod(unit.id, range.from, range.to);
      items.push(this.toConsumptionResponse(unit, range, record, false));
    }

    return {
      domain: 'ENERGY_MANAGEMENT' as const,
      plantId: plant.id,
      plantName: plant.name,
      period: { key: range.period, from: range.from.toISOString(), to: range.to.toISOString() },
      timezone: range.timezone,
      hasAnyConsumptionData: items.some((item) => item.hasData),
      consumerUnits: items,
      notes: [
        'Geração da usina ≠ consumo das UCs.',
        'CONSUMO REAL: NÃO DISPONÍVEL enquanto não houver fonte (distribuidora/medidor/importação/manual autorizado).',
        'Ausência de consumo não é zero kWh.',
        'Rateio, créditos e compensação não são calculados neste endpoint.',
      ],
    };
  }

  /**
   * Fundação do Balanço Mensal: slots para evolução futura.
   * Somente consumo (quando existir) é preenchido; demais campos ficam PENDING.
   */
  async balanceFoundation(consumerUnitId: string, query: EnergyPeriodQuery, user: JwtPayload) {
    const consumption = await this.consumerUnitSummary(consumerUnitId, query, user);
    return {
      domain: 'ENERGY_BALANCE_FOUNDATION' as const,
      consumerUnitId: consumption.consumerUnitId,
      period: consumption.period,
      timezone: consumption.timezone,
      consumption: {
        hasData: consumption.hasData,
        value: consumption.consumption,
      },
      // Alocação de geração à UC exige Rateio — NÃO usar geração da usina como consumo/geração da UC.
      generationAllocated: {
        status: 'PENDING_RATEIO' as const,
        hasData: false,
        value: null,
        note: 'Geração alocada à UC depende do Rateio Versionado (Sprint posterior).',
      },
      compensation: { status: 'NOT_IMPLEMENTED' as const, value: null },
      credits: { status: 'NOT_IMPLEMENTED' as const, value: null },
      billing: { status: 'NOT_IMPLEMENTED' as const, value: null },
      economy: { status: 'NOT_IMPLEMENTED' as const, value: null },
      notes: [
        'Referência funcional Lumi (balanço mensal) — não é especificação regulatória B7.',
        'Geração da usina não é copiada como consumo da UC.',
      ],
    };
  }

  async assertConsumerUnitAccess(consumerUnitId: string, user: JwtPayload) {
    const unit = await this.prisma.consumerUnit.findUnique({
      where: { id: consumerUnitId },
      include: UC_INCLUDE,
    });
    if (!unit) throw new NotFoundException('Unidade consumidora não encontrada.');

    const scope = await this.authorization.resolveAccessScope(user);
    if (scope.unrestricted) return unit;

    const customerId = unit.consumer.customer?.id;
    if (customerId && this.authorization.canAccessCustomer(scope, customerId)) {
      return unit;
    }
    if (unit.plants.some((plant) => this.authorization.canAccessPlant(scope, plant))) {
      return unit;
    }
    // Escopo sem acesso: 404 para não vazar existência
    throw new NotFoundException('Unidade consumidora não encontrada.');
  }

  private resolvePeriod(query: EnergyPeriodQuery) {
    const parsed = this.history.parseQuery(query);
    return {
      period: parsed.period,
      from: parsed.from,
      to: parsed.to,
      timezone: monitoringTimeZone(),
    };
  }

  private toConsumptionResponse(
    unit: {
      id: string;
      number: string;
      contractAccount: string | null;
      consumer: { id: string; name: string; customer?: { id: string; name: string } | null };
      distributor: { id: string; name: string; code: string };
      plants: Array<{ id: string; name: string }>;
    },
    range: { period: string; from: Date; to: Date; timezone: string },
    record: NormalizedConsumptionRecord | null,
    includeTrace: boolean,
  ) {
    const hasData = Boolean(record);
    // Ausência ≠ zero. Nunca promover null → 0.
    const consumption = hasData && record
      ? {
          value: record.energyKwh,
          unit: 'kWh' as const,
          origin: record.origin,
        }
      : null;

    return {
      domain: 'ENERGY_CONSUMPTION' as const,
      consumerUnitId: unit.id,
      consumerUnitNumber: unit.number,
      contractAccount: unit.contractAccount,
      consumer: { id: unit.consumer.id, name: unit.consumer.name },
      distributor: unit.distributor,
      linkedPlants: unit.plants.map((plant) => ({ id: plant.id, name: plant.name })),
      period: {
        key: range.period,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        note: 'Período de consulta ≠ ciclo de faturamento da distribuidora (ainda não modelado).',
      },
      timezone: range.timezone,
      hasData,
      consumption,
      availability: hasData ? ('AVAILABLE' as const) : ('UNAVAILABLE' as const),
      emptyMessage: hasData
        ? null
        : 'Sem dados de consumo para o período. CONSUMO REAL: NÃO DISPONÍVEL.',
      notes: [
        'Consumo pertence à ConsumerUnit — não ao Customer nem ao Plant.',
        'Geração da usina ≠ consumo da UC.',
        'Unidade: kWh (não usar kW como consumo).',
        'Não calcula compensação, crédito, rateio ou faturamento.',
      ],
      ...(includeTrace
        ? {
            trace: hasData && record
              ? {
                  origin: record.origin,
                  receivedAt: record.receivedAt?.toISOString() ?? null,
                  normalizedAt: record.normalizedAt?.toISOString() ?? null,
                  externalRef: record.externalRef ?? null,
                }
              : null,
          }
        : {}),
    };
  }
}
