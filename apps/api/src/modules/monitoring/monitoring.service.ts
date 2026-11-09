import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { JwtPayload } from '../auth/auth.types';
import {
  DashboardPeriod,
  manufacturerLabelFromInverters,
  resolveOperationalStatus,
  toNumber,
} from './monitoring.aggregation';
import { MonitoringAccessService } from './monitoring.access';
import { MonitoringAvailabilityService } from './monitoring.availability.service';
import {
  MonitoringHistoryService,
  sumLatestEnergyField,
  sumLatestEnergyTotal,
  sumLatestPowerKw,
} from './monitoring.history.service';
import {
  countOperationalIntegrationStates,
  resolveOperationalIntegrationState,
  resolvePlantOperationalIntegrationState,
} from './plant-integration-state';

@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: MonitoringHistoryService,
    private readonly access: MonitoringAccessService,
    private readonly availability: MonitoringAvailabilityService,
  ) {}

  async overview(period: DashboardPeriod = 'today', user?: JwtPayload) {
    const now = new Date();
    const plantWhere = user ? await this.access.buildPlantWhere(user) : undefined;
    const historyScope = { plantWhere };
    const alertPlantWhere = plantWhere ? { plant: plantWhere } : {};

    const [plants, openAlerts, recentAlerts, today, month, selected, latest] = await Promise.all([
      this.prisma.plant.findMany({
        where: plantWhere ?? {},
        include: {
          customer: true,
          inverters: { include: { bindings: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.alert.findMany({
        where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] }, ...alertPlantWhere },
        orderBy: { occurredAt: 'desc' },
        take: 20,
      }),
      this.prisma.alert.findMany({
        where: alertPlantWhere,
        include: { plant: { include: { inverters: true } } },
        orderBy: { occurredAt: 'desc' },
        take: 8,
      }),
      this.history.compute(this.history.parseQuery({ period: 'today' }), historyScope),
      this.history.compute(this.history.parseQuery({ period: 'thisMonth' }), historyScope),
      this.history.compute(this.history.parseQuery({ period }), historyScope),
      this.history.latestReadings({ plantWhere }),
    ]);

    const currentPower = sumLatestPowerKw(latest);
    const energyTotal = sumLatestEnergyTotal(latest);
    const latestByPlant = new Map<string, (typeof latest)[number]>();
    const latestByInverter = new Map<string, (typeof latest)[number]>();
    for (const reading of latest) {
      const current = latestByPlant.get(reading.plantId);
      if (!current || current.collectedAt < reading.collectedAt) {
        latestByPlant.set(reading.plantId, reading);
      }
      if (reading.inverterId) {
        const currentInv = latestByInverter.get(reading.inverterId);
        if (!currentInv || currentInv.collectedAt < reading.collectedAt) {
          latestByInverter.set(reading.inverterId, reading);
        }
      }
    }

    const operationalPlants = plants.map((plant) => {
      const reading = latestByPlant.get(plant.id);
      const plantToday = today.byPlant[plant.id] ?? null;
      const inverterStates = plant.inverters.map((inverter) => {
        const binding = inverter.bindings.find((item) => item.provider === inverter.manufacturer)
          ?? inverter.bindings[0]
          ?? null;
        const invReading = latestByInverter.get(inverter.id);
        return resolveOperationalIntegrationState({
          hasBinding: Boolean(binding),
          bindingStatus: binding?.status,
          externalId: binding?.externalId,
          lastReadingAt: invReading?.collectedAt ?? null,
          communicationOk: invReading?.communicationOk ?? null,
          now,
        });
      });
      const integrationState = resolvePlantOperationalIntegrationState(inverterStates);
      const power = sumLatestPowerKw(
        plant.inverters
          .map((inverter) => latestByInverter.get(inverter.id))
          .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      );
      return {
        id: plant.id,
        name: plant.name,
        address: plant.address,
        customerName: plant.customer?.name ?? null,
        installedPowerKw: toNumber(plant.installedPowerKw),
        energyTodayKwh: plantToday,
        energyTodayHasData: plantToday !== null,
        currentPowerKw: power.valueKw,
        currentPowerHasData: power.hasData,
        lastReadingAt: reading?.collectedAt ?? null,
        openAlerts: openAlerts.filter((alert) => alert.plantId === plant.id).length,
        operationalStatus: resolveOperationalStatus(plant.status, reading?.communicationOk),
        integrationState,
        plantStatus: plant.status,
        latitude: toNumber(plant.latitude),
        longitude: toNumber(plant.longitude),
      };
    });

    const integrationCounts = countOperationalIntegrationStates(
      operationalPlants.map((plant) => plant.integrationState),
    );

    const dashboard = {
      generatedAt: now.toISOString(),
      period,
      timezone: selected.timezone,
      currentPower: { ...currentPower, comparisonPercent: null as number | null },
      energyToday: {
        valueKwh: today.energyKwh,
        hasData: today.hasData,
        comparisonPercent: today.comparisonPercent,
      },
      energyMonth: {
        valueKwh: month.energyKwh,
        hasData: month.hasData,
        comparisonPercent: month.comparisonPercent,
      },
      energyTotal,
      plants: {
        total: plants.length,
        online: plants.filter((plant) => plant.status === 'ACTIVE').length,
        offline: plants.filter((plant) => plant.status === 'OFFLINE').length,
        maintenance: plants.filter((plant) => plant.status === 'INACTIVE').length,
        warning: plants.filter((plant) => plant.status === 'WARNING').length,
      },
      integration: integrationCounts,
      alerts: {
        total: openAlerts.length,
        critical: openAlerts.filter((alert) => alert.severity === 'CRITICAL').length,
        warning: openAlerts.filter((alert) => alert.severity === 'WARNING').length,
        info: openAlerts.filter((alert) => alert.severity === 'INFO').length,
      },
      customers: {
        total: plantWhere
          ? new Set(plants.map((plant) => plant.customerId)).size
          : await this.prisma.customer.count(),
      },
      generationSeries: selected.series.map((point) => ({
        label: point.label,
        valueKwh: point.energyKwh,
        collectedAt: point.collectedAt,
      })),
      history: {
        hasData: selected.hasData,
        emptyMessage: selected.emptyMessage,
        energyKwh: selected.energyKwh,
        comparisonPercent: selected.comparisonPercent,
      },
      recentPlants: operationalPlants.slice(0, 8),
      operationalPlants,
      recentAlerts: recentAlerts.map((alert) => ({
        id: alert.id,
        title: alert.title,
        severity: alert.severity,
        status: alert.status,
        occurredAt: alert.occurredAt,
        ruleCode: alert.ruleCode,
        plantName: alert.plant?.name ?? null,
        manufacturerName: manufacturerLabelFromInverters(alert.plant?.inverters ?? []),
      })),
    };

    return {
      totals: {
        plants: plants.length,
        active: dashboard.plants.online,
        warning: dashboard.plants.warning,
        offline: dashboard.plants.offline,
        openAlerts: openAlerts.length,
      },
      plants,
      alerts: openAlerts,
      dashboard,
    };
  }

  async plant(id: string, user: JwtPayload, query: { period?: string; granularity?: string; startDate?: string; endDate?: string }) {
    const plant = await this.access.assertPlant(id, user);
    const [history, latest, availability] = await Promise.all([
      this.history.plantHistory(id, query, user),
      this.history.latestReadings({ plantId: id }),
      this.availability.forPlant(id, query, user),
    ]);
    const alerts = await this.prisma.alert.findMany({
      where: { plantId: id },
      include: { inverter: true },
      orderBy: { occurredAt: 'desc' },
      take: 20,
    });
    const activeAlerts = alerts.filter((alert) => alert.status === 'OPEN' || alert.status === 'ACKNOWLEDGED');
    const online = latest.filter((item) => item.communicationOk !== false).length;
    const currentPower = sumLatestPowerKw(latest);
    const energyToday = sumLatestEnergyField(latest as Array<Record<string, unknown>>, 'energyTodayKwh');
    const energyMonth = sumLatestEnergyField(latest as Array<Record<string, unknown>>, 'energyMonthKwh');
    const energyTotal = sumLatestEnergyTotal(latest);
    const lastReadingAt = latest.reduce<Date | null>((max, item) => {
      if (!max || item.collectedAt > max) return item.collectedAt;
      return max;
    }, null);
    return {
      plant: {
        id: plant.id,
        name: plant.name,
        status: plant.status,
        customer: plant.customer,
        installedPowerKwp: toNumber(plant.installedPowerKw),
        inverterCount: plant.inverters.length,
      },
      history,
      kpis: {
        periodEnergyKwh: history.energyKwh,
        periodEnergyHasData: history.hasData,
        currentPowerKw: currentPower.valueKw,
        currentPowerHasData: currentPower.hasData,
        energyTodayKwh: energyToday.valueKwh,
        energyTodayHasData: energyToday.hasData,
        energyMonthKwh: energyMonth.valueKwh,
        energyMonthHasData: energyMonth.hasData,
        energyTotalKwh: energyTotal.valueKwh,
        energyTotalHasData: energyTotal.hasData,
        lastReadingAt,
        installedPowerKwp: toNumber(plant.installedPowerKw),
        inverterCount: plant.inverters.length,
        invertersOnline: latest.length ? online : null,
        invertersOffline: latest.length ? latest.length - online : null,
        activeAlerts: activeAlerts.length,
        comparisonPercent: history.comparisonPercent,
        performance: null as number | null,
        performanceNote: 'Dados insuficientes para calcular performance.',
        availabilityNote: availability.plant?.availabilityPercent == null
          ? 'Não há dados suficientes para calcular a disponibilidade.'
          : null,
      },
      availability: availability.plant,
      inverterAvailability: availability.inverters,
      inverters: plant.inverters.map((inverter) => {
        const reading = latest.find((item) => item.inverterId === inverter.id);
        const binding = inverter.bindings.find((item) => item.provider === inverter.manufacturer)
          ?? inverter.bindings[0]
          ?? null;
        return {
          id: inverter.id,
          model: inverter.model,
          serialNumber: inverter.serialNumber,
          ratedPowerKw: toNumber(inverter.ratedPowerKw),
          status: inverter.status,
          manufacturerName: inverter.manufacturerRef?.name ?? null,
          manufacturerCode: inverter.manufacturerRef?.code ?? inverter.manufacturer ?? null,
          lastReadingAt: reading?.collectedAt ?? null,
          communicationOk: reading?.communicationOk ?? null,
          powerKw: toNumber(reading?.powerKw),
          powerHasData: reading?.powerKw != null,
          binding: binding
            ? {
                provider: binding.provider,
                externalId: binding.externalId,
                status: binding.status,
                lastSyncAt: binding.lastSyncAt,
                lastErrorAt: binding.lastErrorAt,
                lastErrorMessage: binding.lastErrorMessage,
              }
            : null,
        };
      }),
      alerts,
    };
  }

  async inverter(id: string, user: JwtPayload, query: { period?: string; granularity?: string; startDate?: string; endDate?: string }) {
    const inverter = await this.access.assertInverter(id, user);
    const [history, latestRows, availability] = await Promise.all([
      this.history.inverterHistory(id, query, user),
      this.history.latestReadings({ inverterId: id }),
      this.availability.forInverter(id, query, user),
    ]);
    const latest = latestRows[0] ?? null;
    const alerts = await this.prisma.alert.findMany({
      where: { inverterId: id },
      orderBy: { occurredAt: 'desc' },
      take: 20,
    });
    const binding = inverter.bindings.find((item) => item.provider === inverter.manufacturer) ?? inverter.bindings[0];
    return {
      inverter: {
        id: inverter.id,
        model: inverter.model,
        status: inverter.status,
        ratedPowerKw: toNumber(inverter.ratedPowerKw),
        plant: inverter.plant,
        lastSyncAt: binding?.lastSyncAt ?? null,
      },
      history,
      latestReading: latest ? {
        collectedAt: latest.collectedAt,
        powerKw: toNumber(latest.powerKw),
        energyTodayKwh: toNumber(latest.energyTodayKwh),
        energyTotalKwh: toNumber(latest.energyTotalKwh),
        communicationOk: latest.communicationOk,
      } : null,
      emptyReadingMessage: latest ? null : 'Sem dados de monitoramento.',
      availability,
      alerts,
    };
  }
}

