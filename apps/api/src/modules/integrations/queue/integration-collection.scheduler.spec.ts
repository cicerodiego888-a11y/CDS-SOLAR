import { IntegrationCollectionScheduler } from './integration-collection.scheduler';

describe('IntegrationCollectionScheduler', () => {
  it('não agenda quando Redis está indisponível', async () => {
    const eligibility = { listEligibleInverterIds: jest.fn() };
    const queue = { isReady: () => false, enqueueMany: jest.fn() };
    const scheduler = new IntegrationCollectionScheduler(eligibility as never, queue as never, { ensureWorker: jest.fn() } as never);
    const result = await scheduler.tick();
    expect(result).toEqual({ enqueued: 0, skipped: true });
    expect(eligibility.listEligibleInverterIds).not.toHaveBeenCalled();
  });

  it('enfileira todos os inversores elegíveis no mesmo núcleo', async () => {
    const eligibility = { listEligibleInverterIds: jest.fn().mockResolvedValue(['a', 'b']) };
    const queue = {
      isReady: () => true,
      enqueueMany: jest.fn().mockResolvedValue([
        { ok: true, jobId: 'collect-inverter_a' },
        { ok: true, jobId: 'collect-inverter_b' },
      ]),
      enqueueAlertEvaluation: jest.fn().mockResolvedValue({ ok: true, jobId: 'evaluate-monitoring-alerts' }),
    };
    const scheduler = new IntegrationCollectionScheduler(eligibility as never, queue as never, { ensureWorker: jest.fn() } as never);
    const result = await scheduler.tick();
    expect(queue.enqueueMany).toHaveBeenCalledWith(['a', 'b'], 'SCHEDULED');
    expect(queue.enqueueAlertEvaluation).toHaveBeenCalledWith('SCHEDULED');
    expect(result).toMatchObject({ eligible: 2 });
  });

  it('não propaga erro do tick', async () => {
    const eligibility = { listEligibleInverterIds: jest.fn().mockRejectedValue(new Error('db down')) };
    const queue = { isReady: () => true, enqueueMany: jest.fn() };
    const scheduler = new IntegrationCollectionScheduler(eligibility as never, queue as never, { ensureWorker: jest.fn() } as never);
    await expect(scheduler.tick()).resolves.toEqual({ enqueued: 0, skipped: true, reason: 'TICK_FAILED' });
  });
});
