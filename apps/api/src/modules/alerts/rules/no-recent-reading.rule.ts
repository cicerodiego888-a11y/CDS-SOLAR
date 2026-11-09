import { ALERT_RULE, RULE_SEVERITY, RULE_TITLE, noReadingThresholdSeconds } from '../alert.constants';
import { AlertDecision, AlertEvaluationContext, MonitoringAlertRule } from '../alert.types';

function isWithinThreshold(value: Date | null | undefined, now: Date, thresholdMs: number): boolean {
  if (!value) return false;
  const age = now.getTime() - value.getTime();
  return Number.isFinite(age) && age <= thresholdMs;
}

/**
 * NO_RECENT_READING (COERENCIA-03):
 * - Observação recente (persistida ou lastSyncAt) → não abre falso positivo.
 * - Resolve somente quando há leitura persistida recente (contrato histórico).
 * - lastSyncAt recente sozinho → skip (não abre, não resolve).
 */
export class NoRecentReadingRule implements MonitoringAlertRule {
  readonly code = ALERT_RULE.NO_RECENT_READING;

  evaluate(context: AlertEvaluationContext): AlertDecision {
    if (context.collectability !== 'COLLECTABLE') return { action: 'skip' };
    const now = context.now ?? new Date();
    const thresholdMs = noReadingThresholdSeconds() * 1000;
    const observation = context.lastReadingAt ?? null;
    const persisted = context.persistedLastReadingAt ?? null;
    const observationRecent = isWithinThreshold(observation, now, thresholdMs);
    const persistedRecent = isWithinThreshold(persisted, now, thresholdMs);

    if (observationRecent) {
      if (persistedRecent) {
        return { action: 'resolve', ruleCode: this.code };
      }
      // lastSyncAt (ou observação não sustentada por persistência) recente: não resolve.
      return { action: 'skip' };
    }

    return {
      action: 'open',
      ruleCode: this.code,
      severity: RULE_SEVERITY[this.code],
      title: RULE_TITLE[this.code],
      description: `${context.plantName || 'Usina'} / ${context.inverterName || context.inverterId}: sem leitura recente acima de ${noReadingThresholdSeconds()} segundos.`,
    };
  }
}
