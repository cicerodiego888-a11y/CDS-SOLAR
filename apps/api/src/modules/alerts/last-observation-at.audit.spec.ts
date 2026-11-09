/**
 * AUDITORIA B7-MONITORAMENTO-COERENCIA-02 — precedência de timestamps.
 * Documenta divergência entre seletor atual (??) e proposta (mais recente válido).
 */
import {
  selectLastObservationAtCurrent,
  selectLastObservationAtProposed,
  selectLastObservationForInverter,
} from './last-observation-at';

const now = new Date('2026-11-08T03:00:00.000Z');
const oldPersisted = new Date('2026-10-01T12:00:00.000Z');
const recentSync = new Date('2026-11-08T02:55:00.000Z');
const recentPersisted = new Date('2026-11-08T02:50:00.000Z');
const oldSync = new Date('2026-09-01T12:00:00.000Z');

describe('AUDITORIA — precedência collectedAt vs lastSyncAt', () => {
  it('1) histórico antigo + lastSyncAt recente: atual ignora sync; proposta usa o mais recente', () => {
    const input = {
      inverterId: 'inv-a',
      persistedCollectedAt: oldPersisted,
      bindingLastSyncAt: recentSync,
      now,
    };
    expect(selectLastObservationAtCurrent(input)?.toISOString()).toBe(oldPersisted.toISOString());
    expect(selectLastObservationAtProposed(input)?.toISOString()).toBe(recentSync.toISOString());
    expect(selectLastObservationAtCurrent(input)?.getTime())
      .toBeLessThan(selectLastObservationAtProposed(input)!.getTime());
  });

  it('2) histórico recente + lastSyncAt antigo: ambos coincidem no persistido', () => {
    const input = {
      inverterId: 'inv-a',
      persistedCollectedAt: recentPersisted,
      bindingLastSyncAt: oldSync,
      now,
    };
    expect(selectLastObservationAtCurrent(input)?.toISOString()).toBe(recentPersisted.toISOString());
    expect(selectLastObservationAtProposed(input)?.toISOString()).toBe(recentPersisted.toISOString());
  });

  it('3) ausência de histórico + lastSyncAt válido: ambos usam lastSyncAt', () => {
    const input = {
      inverterId: 'inv-a',
      persistedCollectedAt: null,
      bindingLastSyncAt: recentSync,
      now,
    };
    expect(selectLastObservationAtCurrent(input)?.toISOString()).toBe(recentSync.toISOString());
    expect(selectLastObservationAtProposed(input)?.toISOString()).toBe(recentSync.toISOString());
  });

  it('4) ausência dos dois timestamps: ambos retornam null', () => {
    const input = {
      inverterId: 'inv-a',
      persistedCollectedAt: null,
      bindingLastSyncAt: null,
      now,
    };
    expect(selectLastObservationAtCurrent(input)).toBeNull();
    expect(selectLastObservationAtProposed(input)).toBeNull();
  });

  it('5) timestamp inválido / futuro indevido: rejeitado', () => {
    const invalid = {
      inverterId: 'inv-a',
      persistedCollectedAt: 'not-a-date',
      bindingLastSyncAt: recentSync,
      now,
    };
    expect(selectLastObservationAtCurrent(invalid)?.toISOString()).toBe(recentSync.toISOString());
    expect(selectLastObservationAtProposed(invalid)?.toISOString()).toBe(recentSync.toISOString());

    const farFuture = new Date('2099-01-01T00:00:00.000Z');
    const futureOnly = {
      inverterId: 'inv-a',
      persistedCollectedAt: farFuture,
      bindingLastSyncAt: null,
      now,
    };
    expect(selectLastObservationAtCurrent(futureOnly)).toBeNull();
    expect(selectLastObservationAtProposed(futureOnly)).toBeNull();

    // Atual (??) aceitaria persistido inválido como falsy e cairia no sync —
    // mas se persistido for Date Invalid, toValidDate no espelho já rejeita.
    const emptyString = {
      inverterId: 'inv-a',
      persistedCollectedAt: '',
      bindingLastSyncAt: recentSync,
      now,
    };
    expect(selectLastObservationAtProposed(emptyString)?.toISOString()).toBe(recentSync.toISOString());
  });

  it('6) isolamento entre inversores: não usa timestamp de outro inversor', () => {
    const rows = [
      {
        inverterId: 'inv-ulisses',
        persistedCollectedAt: oldPersisted,
        bindingLastSyncAt: recentSync,
        now,
      },
      {
        inverterId: 'inv-jose',
        persistedCollectedAt: new Date('2026-11-08T02:59:00.000Z'),
        bindingLastSyncAt: new Date('2026-11-08T02:59:30.000Z'),
        now,
      },
    ];
    const forUlisses = selectLastObservationForInverter('inv-ulisses', rows);
    const forJose = selectLastObservationForInverter('inv-jose', rows);
    expect(forUlisses?.toISOString()).toBe(recentSync.toISOString());
    expect(forJose?.toISOString()).toBe(rows[1].bindingLastSyncAt.toISOString());
    expect(forUlisses?.toISOString()).not.toBe(forJose?.toISOString());
    expect(selectLastObservationForInverter('inv-outro', rows)).toBeNull();
  });

  it('evidência: produção (??) diverge da proposta no cenário histórico antigo + sync recente', () => {
    const input = {
      inverterId: 'inv-a',
      persistedCollectedAt: oldPersisted,
      bindingLastSyncAt: recentSync,
      now,
    };
    const current = selectLastObservationAtCurrent(input)!;
    const proposed = selectLastObservationAtProposed(input)!;
    // Com threshold 900s, current (outubro) abriria NO_RECENT_READING; proposed (agora) resolveria/manteria ok.
    const thresholdMs = 900_000;
    expect(now.getTime() - current.getTime()).toBeGreaterThan(thresholdMs);
    expect(now.getTime() - proposed.getTime()).toBeLessThanOrEqual(thresholdMs);
  });
});
