import { AlertSeverity } from '@prisma/client';
import { AlertRuleCode } from './alert.constants';

export type IntegrationCollectability = 'COLLECTABLE' | 'BLOCKED' | 'NOT_CONFIGURED' | 'NOT_SUPPORTED';

export interface AlertEvaluationContext {
  inverterId: string;
  inverterName?: string | null;
  plantId: string;
  plantName?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  status?: 'ONLINE' | 'OFFLINE' | 'WARNING' | 'ERROR' | 'UNKNOWN';
  collectedAt?: Date;
  /**
   * Última observação considerada para ausência (max válido persistido/lastSyncAt).
   * Usada para decidir se há evidência recente (evitar falso positivo de open).
   */
  lastReadingAt?: Date | null;
  /**
   * Última MonitoringReading.collectedAt válida do inversor.
   * Somente evidência persistida autoriza resolve de NO_RECENT_READING na ausência.
   */
  persistedLastReadingAt?: Date | null;
  readingValid?: boolean;
  collectability: IntegrationCollectability;
  provider?: string;
  now?: Date;
}

export type AlertDecision =
  | { action: 'open'; ruleCode: AlertRuleCode; severity: AlertSeverity; title: string; description: string }
  | { action: 'resolve'; ruleCode: AlertRuleCode }
  | { action: 'skip' };

export interface MonitoringAlertRule {
  code: AlertRuleCode;
  evaluate(context: AlertEvaluationContext): AlertDecision;
}
