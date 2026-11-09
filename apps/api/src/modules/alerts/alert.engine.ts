import { Injectable } from '@nestjs/common';
import { AlertStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { createDefaultIntegrationEngine } from '../integrations/integration.engine';
import {
  ALERT_ACTOR_SYSTEM,
  ALERT_EVENT,
  ALERT_RULE,
  alertFingerprint,
} from './alert.constants';
import { AlertDecision, AlertEvaluationContext, IntegrationCollectability, MonitoringAlertRule } from './alert.types';
import { selectLastObservationAt } from './last-observation-at';
import { GenerationAnomalyRule } from './rules/generation-anomaly.rule';
import { NoRecentReadingRule } from './rules/no-recent-reading.rule';
import { InverterErrorRule, InverterOfflineRule, InverterWarningRule } from './rules/status.rules';

const ACTIVE_STATUSES: AlertStatus[] = ['OPEN', 'ACKNOWLEDGED'];

@Injectable()
export class MonitoringAlertService {
  private readonly rules: MonitoringAlertRule[];
  private readonly engine = createDefaultIntegrationEngine();

  constructor(private readonly prisma: PrismaService) {
    this.rules = [
      new InverterOfflineRule(),
      new InverterWarningRule(),
      new InverterErrorRule(),
      new NoRecentReadingRule(),
      new GenerationAnomalyRule(),
    ];
  }

  async evaluateAfterCollection(context: AlertEvaluationContext) {
    this.log({ event: 'evaluation started', inverterId: context.inverterId, reason: 'COLLECTION' });
    const decisions = this.rules
      .filter((rule) => rule.code !== ALERT_RULE.NO_RECENT_READING)
      .map((rule) => this.safeEvaluate(rule, context));
    if (context.readingValid && context.collectedAt) {
      decisions.push({ action: 'resolve', ruleCode: ALERT_RULE.NO_RECENT_READING });
    }
    return this.apply(context, decisions);
  }

  async evaluateAbsence(context: AlertEvaluationContext) {
    const rule = this.rules.find((item) => item.code === ALERT_RULE.NO_RECENT_READING);
    if (!rule) return [];
    return this.apply(context, [this.safeEvaluate(rule, context)]);
  }

  async evaluateAbsenceForEligible() {
    this.log({ event: 'evaluation started', reason: 'SCHEDULED' });
    const inverters = await this.prisma.inverter.findMany({
      where: { status: { not: 'INACTIVE' } },
      include: {
        plant: { include: { customer: true } },
        manufacturerRef: true,
        bindings: true,
        readings: { orderBy: { collectedAt: 'desc' }, take: 1, select: { collectedAt: true } },
      },
    });
    const results = [];
    for (const inverter of inverters) {
      const collectability = this.resolveCollectability(inverter);
      const manufacturer = inverter.manufacturerRef?.code ?? inverter.manufacturer;
      const binding = inverter.bindings.find((item) => item.provider === manufacturer);
      const persistedLastReadingAt = inverter.readings[0]?.collectedAt ?? null;
      // Mais recente válido entre persistido e lastSyncAt do mesmo inversor/binding.
      const lastReadingAt = selectLastObservationAt({
        inverterId: inverter.id,
        bindingId: binding?.id,
        persistedCollectedAt: persistedLastReadingAt,
        bindingLastSyncAt: binding?.lastSyncAt ?? null,
      });
      results.push(...await this.evaluateAbsence({
        inverterId: inverter.id,
        inverterName: inverter.model,
        plantId: inverter.plantId,
        plantName: inverter.plant.name,
        customerId: inverter.plant.customerId,
        customerName: inverter.plant.customer?.name,
        lastReadingAt,
        persistedLastReadingAt,
        collectability,
        provider: manufacturer,
      }));
    }
    return results;
  }

  resolveCollectability(inverter: {
    manufacturer: string;
    manufacturerRef?: { code: string } | null;
    bindings: Array<{ provider: string; status?: string }>;
  }): IntegrationCollectability {
    const manufacturer = inverter.manufacturerRef?.code ?? inverter.manufacturer;
    const binding = inverter.bindings.find((item) => item.provider === manufacturer);
    if (!binding) return 'NOT_CONFIGURED';
    const adapter = this.engine.resolve(binding.provider);
    if (!adapter) return 'NOT_SUPPORTED';
    const runtime = adapter.runtimeState();
    if (!runtime.available) return 'NOT_SUPPORTED';
    if (runtime.mode === 'blocked' || binding.status === 'NOT_CONFIGURED') return 'BLOCKED';
    return 'COLLECTABLE';
  }

  private safeEvaluate(rule: MonitoringAlertRule, context: AlertEvaluationContext): AlertDecision {
    try {
      const decision = rule.evaluate(context);
      this.log({ event: 'rule evaluated', rule: rule.code, inverterId: context.inverterId, result: decision.action });
      return decision;
    } catch {
      this.log({ event: 'rule evaluated', rule: rule.code, inverterId: context.inverterId, result: 'error' });
      return { action: 'skip' };
    }
  }

  private async apply(context: AlertEvaluationContext, decisions: AlertDecision[]) {
    const applied = [];
    for (const decision of decisions) {
      if (!decision || decision.action === 'skip') continue;
      const fingerprint = alertFingerprint(decision.ruleCode, context.inverterId);
      if (decision.action === 'open') {
        applied.push(await this.openOrTouch(context, decision, fingerprint));
      } else {
        applied.push(await this.resolveActive(fingerprint, ALERT_ACTOR_SYSTEM, 'AUTOMATIC'));
      }
    }
    return applied.filter(Boolean);
  }

  private async openOrTouch(
    context: AlertEvaluationContext,
    decision: Extract<AlertDecision, { action: 'open' }>,
    fingerprint: string,
  ) {
    const existing = await this.prisma.alert.findFirst({
      where: { fingerprint, status: { in: ACTIVE_STATUSES } },
    });
    if (existing) {
      return this.prisma.alert.update({
        where: { id: existing.id },
        data: { description: decision.description, title: decision.title },
      });
    }
    this.log({ event: 'created', rule: decision.ruleCode, inverterId: context.inverterId });
    return this.prisma.alert.create({
      data: {
        plantId: context.plantId,
        inverterId: context.inverterId,
        severity: decision.severity,
        status: 'OPEN',
        type: decision.ruleCode,
        ruleCode: decision.ruleCode,
        fingerprint,
        title: decision.title,
        description: decision.description,
        events: { create: { type: ALERT_EVENT.CREATED, actor: ALERT_ACTOR_SYSTEM } },
      },
    });
  }

  private async resolveActive(fingerprint: string, actor: string, resolutionType: 'MANUAL' | 'AUTOMATIC') {
    const existing = await this.prisma.alert.findFirst({
      where: { fingerprint, status: { in: ACTIVE_STATUSES } },
    });
    if (!existing) return null;
    this.log({ event: 'resolved', rule: existing.ruleCode, alertId: existing.id, inverterId: existing.inverterId ?? undefined });
    return this.prisma.alert.update({
      where: { id: existing.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedBy: actor,
        resolutionType,
        events: { create: { type: ALERT_EVENT.RESOLVED, actor } },
      },
    });
  }

  private log(fields: Record<string, string | undefined>) {
    const safe = Object.fromEntries(
      Object.entries({ scope: 'ALERT', ...fields }).filter(([key, value]) => {
        return value !== undefined && !/password|token|authorization|cookie|secret|credential/i.test(key);
      }),
    );
    console.info(safe);
  }
}
