import {
  COLLECT_INVERTER_JOB,
  COLLECT_JOB_ATTEMPTS,
  EVALUATE_ALERTS_JOB_ID,
  EVALUATE_MONITORING_ALERTS_JOB,
  collectJobId,
} from './integration-queue.constants';
import { IntegrationQueueService } from './integration-queue.service';

describe('collectJobId', () => {
  it('não usa dois-pontos (BullMQ 6 rejeita custom id com :)', () => {
    expect(collectJobId('i1')).toBe('collect-inverter_i1');
    expect(collectJobId('a:b')).toBe('collect-inverter_a-b');
    expect(collectJobId('i1')).not.toContain(':');
  });
});

describe('IntegrationQueueService', () => {
  function setup(overrides: { ready?: boolean; existingState?: string | null } = {}) {
    const add = jest.fn().mockResolvedValue({ id: collectJobId('i1') });
    const remove = jest.fn();
    const getJob = jest.fn().mockResolvedValue(
      overrides.existingState
        ? { getState: async () => overrides.existingState, remove }
        : null,
    );
    const getJobCounts = jest.fn().mockResolvedValue({
      waiting: 1, active: 2, completed: 3, failed: 4, delayed: 5,
    });
    const service = new IntegrationQueueService({
      isReady: () => overrides.ready !== false,
      getClient: () => ({}),
    } as never);
    (service as unknown as { queue: unknown }).queue = { add, getJob, getJobCounts };
    return { service, add, remove };
  }

  it('cria job COLLECT_INVERTER com id determinístico', async () => {
    const { service, add } = setup();
    const result = await service.enqueueCollect('i1', 'SCHEDULED');
    expect(result).toEqual({ ok: true, jobId: 'collect-inverter_i1' });
    expect(add).toHaveBeenCalledWith(
      COLLECT_INVERTER_JOB,
      { inverterId: 'i1', reason: 'SCHEDULED' },
      expect.objectContaining({ jobId: 'collect-inverter_i1', attempts: COLLECT_JOB_ATTEMPTS }),
    );
  });

  it('rejeita payload inválido', async () => {
    const { service, add } = setup();
    await expect(service.enqueueCollect('   ')).resolves.toEqual({ ok: false, reason: 'INVALID_PAYLOAD' });
    expect(add).not.toHaveBeenCalled();
  });

  it('não duplica job ativo do mesmo inversor', async () => {
    const { service, add } = setup({ existingState: 'active' });
    const result = await service.enqueueCollect('i1');
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('DUPLICATE');
    expect(add).not.toHaveBeenCalled();
  });

  it('enfileira múltiplos inversores', async () => {
    const { service, add } = setup();
    await service.enqueueMany(['a', 'b'], 'SCHEDULED');
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('cria job EVALUATE_MONITORING_ALERTS sem duplicar waiting/active', async () => {
    const { service, add } = setup();
    const result = await service.enqueueAlertEvaluation('SCHEDULED');
    expect(result).toEqual({ ok: true, jobId: EVALUATE_ALERTS_JOB_ID });
    expect(add).toHaveBeenCalledWith(
      EVALUATE_MONITORING_ALERTS_JOB,
      { inverterId: '', reason: 'SCHEDULED' },
      expect.objectContaining({ jobId: EVALUATE_ALERTS_JOB_ID, attempts: COLLECT_JOB_ATTEMPTS }),
    );

    const duplicate = setup({ existingState: 'waiting' });
    const skipped = await duplicate.service.enqueueAlertEvaluation('SCHEDULED');
    expect(skipped).toMatchObject({ skipped: true, reason: 'DUPLICATE' });
    expect(duplicate.add).not.toHaveBeenCalled();
  });

  it('sinaliza Redis indisponível', async () => {
    const { service } = setup({ ready: false });
    await expect(service.enqueueCollect('i1')).resolves.toEqual({ ok: false, reason: 'REDIS_UNAVAILABLE' });
    await expect(service.snapshot()).resolves.toMatchObject({ redis: 'down' });
  });

  it('expõe estados da fila sem secrets', async () => {
    const { service } = setup();
    const snapshot = await service.snapshot();
    expect(snapshot).toEqual({
      waiting: 1, active: 2, completed: 3, failed: 4, delayed: 5, redis: 'ok',
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/password|token|secret|authorization/i);
  });

  it('não deixa falha do BullMQ derrubar o processo', async () => {
    const { service, add } = setup();
    add.mockRejectedValue(new Error('Custom Id cannot contain :'));
    await expect(service.enqueueCollect('i1')).resolves.toEqual({
      ok: false,
      jobId: 'collect-inverter_i1',
      reason: 'ENQUEUE_FAILED',
    });
  });
});
