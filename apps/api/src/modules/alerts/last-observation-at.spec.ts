import {
  DEFAULT_FUTURE_SKEW_MS,
  selectLastObservationAt,
  selectLastObservationForBinding,
  selectLastObservationForInverter,
} from './last-observation-at';

const now = new Date('2026-11-08T03:00:00.000Z');
const oldPersisted = new Date('2026-10-01T12:00:00.000Z');
const recentSync = new Date('2026-11-08T02:55:00.000Z');
const recentPersisted = new Date('2026-11-08T02:50:00.000Z');
const oldSync = new Date('2026-09-01T12:00:00.000Z');

describe('selectLastObservationAt (COERENCIA-03)', () => {
  it('1) histórico antigo + lastSyncAt recente → lastSyncAt', () => {
    expect(selectLastObservationAt({
      inverterId: 'inv-a',
      bindingId: 'bind-a',
      persistedCollectedAt: oldPersisted,
      bindingLastSyncAt: recentSync,
      now,
    })?.toISOString()).toBe(recentSync.toISOString());
  });

  it('2) histórico recente + lastSyncAt antigo → histórico', () => {
    expect(selectLastObservationAt({
      inverterId: 'inv-a',
      bindingId: 'bind-a',
      persistedCollectedAt: recentPersisted,
      bindingLastSyncAt: oldSync,
      now,
    })?.toISOString()).toBe(recentPersisted.toISOString());
  });

  it('3) sem histórico + lastSyncAt válido → lastSyncAt', () => {
    expect(selectLastObservationAt({
      inverterId: 'inv-a',
      bindingId: 'bind-a',
      persistedCollectedAt: null,
      bindingLastSyncAt: recentSync,
      now,
    })?.toISOString()).toBe(recentSync.toISOString());
  });

  it('4) sem os dois → null', () => {
    expect(selectLastObservationAt({
      inverterId: 'inv-a',
      bindingId: 'bind-a',
      persistedCollectedAt: null,
      bindingLastSyncAt: null,
      now,
    })).toBeNull();
  });

  it('5) timestamp inválido → rejeitar', () => {
    expect(selectLastObservationAt({
      inverterId: 'inv-a',
      persistedCollectedAt: 'not-a-date',
      bindingLastSyncAt: null,
      now,
    })).toBeNull();
    expect(selectLastObservationAt({
      inverterId: 'inv-a',
      persistedCollectedAt: 'not-a-date',
      bindingLastSyncAt: recentSync,
      now,
    })?.toISOString()).toBe(recentSync.toISOString());
  });

  it('6) timestamp futuro além do limite → rejeitar', () => {
    const farFuture = new Date(now.getTime() + DEFAULT_FUTURE_SKEW_MS + 60_000);
    expect(selectLastObservationAt({
      inverterId: 'inv-a',
      persistedCollectedAt: farFuture,
      bindingLastSyncAt: null,
      now,
    })).toBeNull();
  });

  it('7) timestamp futuro dentro da tolerância (5 min) → aceito', () => {
    const withinSkew = new Date(now.getTime() + DEFAULT_FUTURE_SKEW_MS - 1_000);
    expect(selectLastObservationAt({
      inverterId: 'inv-a',
      persistedCollectedAt: withinSkew,
      bindingLastSyncAt: null,
      now,
    })?.toISOString()).toBe(withinSkew.toISOString());
  });

  it('8) isolamento entre inversores', () => {
    const rows = [
      {
        inverterId: 'inv-ulisses',
        bindingId: 'b-u',
        persistedCollectedAt: oldPersisted,
        bindingLastSyncAt: recentSync,
        now,
      },
      {
        inverterId: 'inv-jose',
        bindingId: 'b-j',
        persistedCollectedAt: new Date('2026-11-08T02:59:00.000Z'),
        bindingLastSyncAt: new Date('2026-11-08T02:59:30.000Z'),
        now,
      },
    ];
    expect(selectLastObservationForInverter('inv-ulisses', rows)?.toISOString())
      .toBe(recentSync.toISOString());
    expect(selectLastObservationForInverter('inv-jose', rows)?.toISOString())
      .toBe(rows[1].bindingLastSyncAt.toISOString());
    expect(selectLastObservationForInverter('inv-outro', rows)).toBeNull();
  });

  it('9) isolamento entre bindings', () => {
    const rows = [
      {
        inverterId: 'inv-a',
        bindingId: 'bind-auxsol',
        persistedCollectedAt: null,
        bindingLastSyncAt: recentSync,
        now,
      },
      {
        inverterId: 'inv-a',
        bindingId: 'bind-other',
        persistedCollectedAt: null,
        bindingLastSyncAt: new Date('2026-11-08T02:59:00.000Z'),
        now,
      },
    ];
    expect(selectLastObservationForBinding('inv-a', 'bind-auxsol', rows)?.toISOString())
      .toBe(recentSync.toISOString());
    expect(selectLastObservationForBinding('inv-a', 'bind-other', rows)?.toISOString())
      .toBe(rows[1].bindingLastSyncAt.toISOString());
    expect(selectLastObservationForBinding('inv-a', 'bind-missing', rows)).toBeNull();
  });
});
