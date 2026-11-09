import { buildLiveReadingView } from './live-reading.view';

describe('buildLiveReadingView', () => {
  it('não inventa zeros quando a coleta vem vazia', () => {
    const view = buildLiveReadingView({ readings: [], valid: [], persisted: false });
    expect(view.available).toBe(false);
    expect(view.powerKw).toBeNull();
    expect(view.energyTodayKwh).toBeNull();
    expect(view.unavailableReason).toMatch(/não retornou dados/i);
  });

  it('projeta campos normalizados e auxiliares sem expor secrets', () => {
    const view = buildLiveReadingView({
      readings: [{
        collectedAt: new Date('2026-11-07T20:29:39.000Z'),
        powerKw: 0,
        energyTodayKwh: 69.32,
        energyMonthKwh: 457.53,
        energyTotalKwh: 5768.11,
        communicationOk: true,
        status: 'UNKNOWN',
        rawPayload: {
          code: 'AWX-0000',
          access_token: 'SHOULD_NOT_APPEAR',
          data: {
            status: '1',
            lastCommTime: '2026-11-08T04:29:39.636+08:00',
            alarmCurrent: {
              mainFaultCode: 0,
              faultCode: 0,
              mainAlarmCode: 0,
              alarmCode: 0,
              alarmCount: 0,
            },
          },
        },
      }],
      valid: [{
        collectedAt: new Date('2026-11-07T20:29:39.000Z'),
        powerKw: 0,
        energyTodayKwh: 69.32,
        energyMonthKwh: 457.53,
        energyTotalKwh: 5768.11,
        communicationOk: true,
        status: 'UNKNOWN',
        rawPayload: {
          code: 'AWX-0000',
          access_token: 'SHOULD_NOT_APPEAR',
          data: {
            status: '1',
            lastCommTime: '2026-11-08T04:29:39.636+08:00',
            alarmCurrent: {
              mainFaultCode: 0,
              faultCode: 0,
              mainAlarmCode: 0,
              alarmCode: 0,
              alarmCount: 0,
            },
          },
        },
      }],
      persisted: false,
    });

    expect(view.available).toBe(true);
    expect(view.powerKw).toBe(0);
    expect(view.energyTodayKwh).toBe(69.32);
    expect(view.lastCommAt).toBe('2026-11-07T20:29:39.636Z');
    expect(view.equipmentStatus).toBe('1');
    expect(view.alarms?.present).toBe(false);
    expect(JSON.stringify(view)).not.toMatch(/SHOULD_NOT_APPEAR|access_token/i);
  });

  it('lastCommAt sem timezone usa UTC (alinhado a collectedAt/dt)', () => {
    const view = buildLiveReadingView({
      readings: [],
      valid: [{
        collectedAt: new Date('2026-11-08T16:34:41.000Z'),
        communicationOk: true,
        powerKw: 0,
        rawPayload: { data: { lastCommTime: '2026-11-08 16:34:41' } },
      }],
      persisted: false,
    });
    expect(view.collectedAt).toBe('2026-11-08T16:34:41.000Z');
    expect(view.lastCommAt).toBe('2026-11-08T16:34:41.000Z');
  });

  it('falha de comunicação não vira geração zero', () => {
    const view = buildLiveReadingView({
      readings: [{ communicationOk: false } as never],
      valid: [],
      persisted: false,
      emptyReason: 'Leitura inválida após falha de comunicação.',
    });
    expect(view.available).toBe(false);
    expect(view.energyTodayKwh).toBeNull();
    expect(view.energyTotalKwh).toBeNull();
  });
});
