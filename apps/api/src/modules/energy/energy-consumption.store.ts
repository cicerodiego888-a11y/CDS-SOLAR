import { Injectable } from '@nestjs/common';

/**
 * Porta de leitura de consumo normalizado por UC.
 * Sprint 9: sem tabela Prisma — implementação padrão sempre retorna null (CONSUMO REAL NÃO DISPONÍVEL).
 * Testes injetam fixtures isoladas; nunca persistir fixture como dado operacional.
 */
export type ConsumptionOrigin = 'DISTRIBUTOR' | 'METER' | 'IMPORT' | 'MANUAL' | 'OTHER';

export type NormalizedConsumptionRecord = {
  consumerUnitId: string;
  periodFrom: Date;
  periodTo: Date;
  energyKwh: number;
  unit: 'kWh';
  origin: ConsumptionOrigin;
  receivedAt?: Date;
  normalizedAt?: Date;
  externalRef?: string | null;
};

export abstract class EnergyConsumptionStore {
  abstract findForPeriod(
    consumerUnitId: string,
    from: Date,
    to: Date,
  ): Promise<NormalizedConsumptionRecord | null>;
}

/** Store padrão: nenhuma fonte de consumo disponível no sistema. */
@Injectable()
export class UnavailableEnergyConsumptionStore extends EnergyConsumptionStore {
  async findForPeriod(): Promise<NormalizedConsumptionRecord | null> {
    return null;
  }
}
