import { ALERT_RULE } from '../alert.constants';
import { AlertEvaluationContext } from '../alert.types';
import { GenerationAnomalyRule } from './generation-anomaly.rule';
import { NoRecentReadingRule } from './no-recent-reading.rule';
import { InverterErrorRule, InverterOfflineRule, InverterWarningRule } from './status.rules';

function context(overrides: Partial<AlertEvaluationContext> = {}): AlertEvaluationContext {
  return {
    inverterId: 'inv-a',
    inverterName: 'INV-A',
    plantId: 'plant-1',
    plantName: 'Usina Norte',
    collectability: 'COLLECTABLE',
    readingValid: true,
    status: 'ONLINE',
    collectedAt: new Date('2026-09-05T12:00:00.000Z'),
    lastReadingAt: new Date('2026-09-05T12:00:00.000Z'),
    now: new Date('2026-09-05T12:05:00.000Z'),
    ...overrides,
  };
}

describe('Regras de monitoramento', () => {
  it('OFFLINE abre INVERTER_OFFLINE com severidade CRITICAL', () => {
    const decision = new InverterOfflineRule().evaluate(context({ status: 'OFFLINE' }));
    expect(decision).toMatchObject({
      action: 'open',
      ruleCode: ALERT_RULE.INVERTER_OFFLINE,
      severity: 'CRITICAL',
      title: 'Inversor offline',
    });
  });

  it('ONLINE resolve INVERTER_OFFLINE', () => {
    expect(new InverterOfflineRule().evaluate(context({ status: 'ONLINE' }))).toEqual({
      action: 'resolve',
      ruleCode: ALERT_RULE.INVERTER_OFFLINE,
    });
  });

  it('WARNING abre INVERTER_WARNING', () => {
    expect(new InverterWarningRule().evaluate(context({ status: 'WARNING' }))).toMatchObject({
      action: 'open',
      ruleCode: ALERT_RULE.INVERTER_WARNING,
      severity: 'WARNING',
    });
  });

  it('ERROR abre INVERTER_ERROR CRITICAL', () => {
    expect(new InverterErrorRule().evaluate(context({ status: 'ERROR' }))).toMatchObject({
      action: 'open',
      ruleCode: ALERT_RULE.INVERTER_ERROR,
      severity: 'CRITICAL',
    });
  });

  it('leitura inválida não gera alerta operacional de status', () => {
    expect(new InverterOfflineRule().evaluate(context({ status: 'OFFLINE', readingValid: false }))).toEqual({ action: 'skip' });
    expect(new InverterWarningRule().evaluate(context({ status: 'WARNING', readingValid: false }))).toEqual({ action: 'skip' });
    expect(new InverterErrorRule().evaluate(context({ status: 'ERROR', readingValid: false }))).toEqual({ action: 'skip' });
  });

  it('NO_RECENT_READING abre quando a janela é excedida', () => {
    const decision = new NoRecentReadingRule().evaluate(context({
      lastReadingAt: new Date('2026-09-05T11:00:00.000Z'),
      persistedLastReadingAt: new Date('2026-09-05T11:00:00.000Z'),
      now: new Date('2026-09-05T12:00:00.000Z'),
    }));
    expect(decision).toMatchObject({ action: 'open', ruleCode: ALERT_RULE.NO_RECENT_READING, severity: 'CRITICAL' });
  });

  it('NO_RECENT_READING resolve só com leitura persistida recente', () => {
    const recent = new Date('2026-09-05T12:00:00.000Z');
    expect(new NoRecentReadingRule().evaluate(context({
      lastReadingAt: recent,
      persistedLastReadingAt: recent,
      now: new Date('2026-09-05T12:05:00.000Z'),
    }))).toEqual({ action: 'resolve', ruleCode: ALERT_RULE.NO_RECENT_READING });
  });

  it('NO_RECENT_READING com lastSyncAt recente sem persistido faz skip', () => {
    expect(new NoRecentReadingRule().evaluate(context({
      lastReadingAt: new Date('2026-09-05T12:00:00.000Z'),
      persistedLastReadingAt: null,
      now: new Date('2026-09-05T12:05:00.000Z'),
    }))).toEqual({ action: 'skip' });
  });

  it('NO_RECENT_READING não cria para BLOCKED', () => {
    expect(new NoRecentReadingRule().evaluate(context({
      collectability: 'BLOCKED',
      lastReadingAt: null,
    }))).toEqual({ action: 'skip' });
  });

  it('NO_RECENT_READING não cria para NOT_CONFIGURED', () => {
    expect(new NoRecentReadingRule().evaluate(context({
      collectability: 'NOT_CONFIGURED',
      lastReadingAt: null,
    }))).toEqual({ action: 'skip' });
  });

  it('GENERATION_ANOMALY permanece desabilitada sem fabricar comparação', () => {
    const previous = process.env.MONITORING_GENERATION_ANOMALY_ENABLED;
    delete process.env.MONITORING_GENERATION_ANOMALY_ENABLED;
    expect(new GenerationAnomalyRule().evaluate(context())).toEqual({ action: 'skip' });
    process.env.MONITORING_GENERATION_ANOMALY_ENABLED = 'true';
    expect(new GenerationAnomalyRule().evaluate(context())).toEqual({ action: 'skip' });
    process.env.MONITORING_GENERATION_ANOMALY_ENABLED = previous;
  });
});
