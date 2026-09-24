import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { normalizeUtilityNumber } from '../common/utility-number';

export type LegacyPlantAuditItem = {
  plantId: string;
  plantName: string;
  customerId: string;
  customerName: string;
  legacyConsumerUnit: string | null;
  legacyDistributor: string | null;
  consumerUnitId: string | null;
  customerHasConsumer: boolean;
  consumerId: string | null;
  safeMatchConsumerUnitId: string | null;
  category:
    | 'HAS_FORMAL_LINK'
    | 'LEGACY_UC_ONLY'
    | 'LEGACY_DISTRIBUTOR_ONLY'
    | 'NO_ENERGY_INFO'
    | 'SAFE_MATCH_CANDIDATE'
    | 'AMBIGUOUS_OR_INSUFFICIENT';
};

export type LegacyPlantAuditReport = {
  generatedAt: string;
  totals: {
    plants: number;
    withLegacyConsumerUnit: number;
    withLegacyDistributor: number;
    withoutFormalConsumerUnit: number;
    customerHasConsumer: number;
    safeMatchCandidates: number;
    insufficientInfo: number;
    HAS_FORMAL_LINK: number;
    LEGACY_UC_ONLY: number;
    LEGACY_DISTRIBUTOR_ONLY: number;
    NO_ENERGY_INFO: number;
    SAFE_MATCH_CANDIDATE: number;
    AMBIGUOUS_OR_INSUFFICIENT: number;
  };
  items: LegacyPlantAuditItem[];
};

/**
 * Auditoria read-only das Plants legadas.
 * Não converte automaticamente registros ambíguos.
 */
@Injectable()
export class LegacyPlantAuditService {
  constructor(private prisma: PrismaService) {}

  async buildReport(): Promise<LegacyPlantAuditReport> {
    const plants = await this.prisma.plant.findMany({
      include: { customer: true },
      orderBy: { createdAt: 'asc' },
    });

    const consumerIds = plants
      .map((plant) => plant.customer.consumerId)
      .filter((id): id is string => Boolean(id));
    const units = consumerIds.length
      ? await this.prisma.consumerUnit.findMany({
          where: { consumerId: { in: [...new Set(consumerIds)] } },
          include: { distributor: true },
        })
      : [];
    const unitsByConsumer = new Map<string, typeof units>();
    for (const unit of units) {
      const list = unitsByConsumer.get(unit.consumerId) ?? [];
      list.push(unit);
      unitsByConsumer.set(unit.consumerId, list);
    }

    const items: LegacyPlantAuditItem[] = plants.map((plant) => {
      const legacyUc = plant.consumerUnit?.trim() || null;
      const legacyDist = plant.distributor?.trim() || null;
      const customerHasConsumer = Boolean(plant.customer.consumerId);
      const consumerId = plant.customer.consumerId;
      let safeMatchConsumerUnitId: string | null = null;
      let category: LegacyPlantAuditItem['category'];

      if (plant.consumerUnitId) {
        category = 'HAS_FORMAL_LINK';
      } else if (!legacyUc && !legacyDist) {
        category = 'NO_ENERGY_INFO';
      } else if (legacyUc && customerHasConsumer && consumerId) {
        const candidates = (unitsByConsumer.get(consumerId) ?? []).filter((unit) => {
          if (normalizeUtilityNumber(unit.number) !== normalizeUtilityNumber(legacyUc)) return false;
          if (!legacyDist) return true;
          const distName = unit.distributor.name.toLowerCase();
          const distCode = unit.distributor.code.toLowerCase();
          const legacy = legacyDist.toLowerCase();
          return distName === legacy || distCode === legacy || distName.includes(legacy) || legacy.includes(distName);
        });
        if (candidates.length === 1) {
          safeMatchConsumerUnitId = candidates[0].id;
          category = 'SAFE_MATCH_CANDIDATE';
        } else if (!legacyDist && candidates.length === 0) {
          category = 'LEGACY_UC_ONLY';
        } else {
          category = 'AMBIGUOUS_OR_INSUFFICIENT';
        }
      } else if (legacyUc && !legacyDist) {
        category = 'LEGACY_UC_ONLY';
      } else if (legacyDist && !legacyUc) {
        category = 'LEGACY_DISTRIBUTOR_ONLY';
      } else {
        category = 'AMBIGUOUS_OR_INSUFFICIENT';
      }

      return {
        plantId: plant.id,
        plantName: plant.name,
        customerId: plant.customerId,
        customerName: plant.customer.name,
        legacyConsumerUnit: legacyUc,
        legacyDistributor: legacyDist,
        consumerUnitId: plant.consumerUnitId,
        customerHasConsumer,
        consumerId,
        safeMatchConsumerUnitId,
        category,
      };
    });

    const count = (category: LegacyPlantAuditItem['category']) =>
      items.filter((item) => item.category === category).length;

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        plants: items.length,
        withLegacyConsumerUnit: items.filter((item) => Boolean(item.legacyConsumerUnit)).length,
        withLegacyDistributor: items.filter((item) => Boolean(item.legacyDistributor)).length,
        withoutFormalConsumerUnit: items.filter((item) => !item.consumerUnitId).length,
        customerHasConsumer: items.filter((item) => item.customerHasConsumer).length,
        safeMatchCandidates: count('SAFE_MATCH_CANDIDATE'),
        insufficientInfo:
          count('AMBIGUOUS_OR_INSUFFICIENT')
          + count('NO_ENERGY_INFO')
          + count('LEGACY_DISTRIBUTOR_ONLY')
          + count('LEGACY_UC_ONLY'),
        HAS_FORMAL_LINK: count('HAS_FORMAL_LINK'),
        LEGACY_UC_ONLY: count('LEGACY_UC_ONLY'),
        LEGACY_DISTRIBUTOR_ONLY: count('LEGACY_DISTRIBUTOR_ONLY'),
        NO_ENERGY_INFO: count('NO_ENERGY_INFO'),
        SAFE_MATCH_CANDIDATE: count('SAFE_MATCH_CANDIDATE'),
        AMBIGUOUS_OR_INSUFFICIENT: count('AMBIGUOUS_OR_INSUFFICIENT'),
      },
      items,
    };
  }
}
