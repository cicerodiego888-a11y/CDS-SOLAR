import { Injectable } from '@nestjs/common';
import { JwtPayload } from '../auth/auth.types';
import { MonitoringAccessService } from '../monitoring/monitoring.access';
import { HistoryQuery, MonitoringHistoryService } from '../monitoring/monitoring.history.service';

export type EnergyPeriodQuery = Pick<HistoryQuery, 'period' | 'startDate' | 'endDate' | 'granularity'>;

type HistoryResult = Awaited<ReturnType<MonitoringHistoryService['plantHistory']>>;

/**
 * Bounded context: Gestão de Energia.
 * Consome MonitoringReading via MonitoringHistoryService.
 * NÃO altera Monitoring, Alert Engine, Collection, AUXSOL ou regras comerciais.
 */
@Injectable()
export class EnergyManagementService {
  constructor(
    private readonly history: MonitoringHistoryService,
    private readonly access: MonitoringAccessService,
  ) {}

  async plantSummary(plantId: string, query: EnergyPeriodQuery, user: JwtPayload) {
    const plant = await this.access.assertPlant(plantId, user);
    const history = await this.history.plantHistory(plantId, query, user);
    return this.toSummary(plant, history, false);
  }

  async plantGeneration(plantId: string, query: EnergyPeriodQuery, user: JwtPayload) {
    const plant = await this.access.assertPlant(plantId, user);
    const history = await this.history.plantHistory(plantId, query, user);
    return this.toSummary(plant, history, true);
  }

  private toSummary(
    plant: { id: string; name: string; inverters?: Array<{ bindings?: unknown[] }> },
    history: HistoryResult,
    includeSeries: boolean,
  ) {
    const hasData = Boolean(history.hasData);
    const hasIntegrationBinding = Boolean(
      plant.inverters?.some((inverter) => Array.isArray(inverter.bindings) && inverter.bindings.length > 0),
    );

    // Ausência de leitura ≠ zero. Nunca promover energyKwh nulo/ausente para 0.
    const generation = hasData && history.energyKwh !== null && history.energyKwh !== undefined
      ? {
          value: history.energyKwh,
          unit: 'kWh' as const,
          source: history.source,
        }
      : null;

    return {
      domain: 'ENERGY_MANAGEMENT' as const,
      plantId: plant.id,
      plantName: plant.name,
      period: {
        key: history.period,
        from: history.from,
        to: history.to,
        granularity: history.granularity,
      },
      timezone: history.timezone,
      hasData,
      generation,
      emptyMessage: hasData
        ? null
        : (history.emptyMessage ?? 'Sem dados de geração disponíveis para o período.'),
      hasIntegrationBinding,
      notes: [
        'Gestão de Energia não modifica o domínio de Monitoramento.',
        'Unidade de energia: kWh (não converter kW em kWh).',
        ...(history.notes ?? []),
      ],
      ...(includeSeries
        ? {
            series: hasData ? history.series : [],
            byPlant: hasData ? history.byPlant : {},
            byInverter: hasData ? history.byInverter : {},
          }
        : {}),
    };
  }
}
