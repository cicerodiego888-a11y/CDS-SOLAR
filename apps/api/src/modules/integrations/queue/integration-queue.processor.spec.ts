import { NotFoundException } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { collectionFailed, concurrentCollection, integrationBlocked } from '../collection/collection.errors';
import { IntegrationQueueProcessor } from './integration-queue.processor';

function job(data: Record<string, unknown>) {
  return { data, attemptsMade: 0 };
}

describe('IntegrationQueueProcessor', () => {
  it('chama o Motor de Coleta existente', async () => {
    const collectInverter = jest.fn().mockResolvedValue({
      ok: true, inverterId: 'i1', provider: 'AUXSOL', readings: 0, persisted: 0,
    });
    const processor = new IntegrationQueueProcessor({} as never, { collectInverter } as never);
    const result = await processor.process(job({ inverterId: 'i1', reason: 'MANUAL' }) as never);
    expect(collectInverter).toHaveBeenCalledWith('i1');
    expect(result).toMatchObject({ persisted: 0 });
  });

  it('rejeita payload inválido sem retry', async () => {
    const processor = new IntegrationQueueProcessor({} as never, { collectInverter: jest.fn() } as never);
    await expect(processor.process(job({}) as never)).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('trata BLOCKED como conclusão controlada, sem retry', async () => {
    const processor = new IntegrationQueueProcessor({} as never, {
      collectInverter: jest.fn().mockRejectedValue(integrationBlocked()),
    } as never);
    const result = await processor.process(job({ inverterId: 'i1' }) as never);
    expect(result).toMatchObject({ ok: false, code: 'INTEGRATION_BLOCKED', persisted: 0 });
  });

  it('9) CONCURRENT_COLLECTION conclui sem retry repetitivo', async () => {
    const collectInverter = jest.fn().mockRejectedValue(concurrentCollection());
    const processor = new IntegrationQueueProcessor({} as never, { collectInverter } as never);
    const result = await processor.process(job({ inverterId: 'i1' }) as never);
    expect(result).toMatchObject({ ok: false, code: 'CONCURRENT_COLLECTION', persisted: 0 });
    expect(collectInverter).toHaveBeenCalledTimes(1);
  });

  it('10) propaga falha recuperável para o retry do BullMQ', async () => {
    const processor = new IntegrationQueueProcessor({} as never, {
      collectInverter: jest.fn().mockRejectedValue(collectionFailed()),
    } as never);
    await expect(processor.process(job({ inverterId: 'i1' }) as never)).rejects.toMatchObject({ code: 'COLLECTION_FAILED' });
  });

  it('marca inversor inexistente como falha definitiva', async () => {
    const processor = new IntegrationQueueProcessor({} as never, {
      collectInverter: jest.fn().mockRejectedValue(new NotFoundException('Inversor não encontrado.')),
    } as never);
    await expect(processor.process(job({ inverterId: 'missing' }) as never)).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('orquestra EVALUATE_MONITORING_ALERTS sem duplicar regras', async () => {
    const evaluateAbsence = jest.fn().mockResolvedValue([{ id: 'a1' }]);
    const collectInverter = jest.fn();
    const processor = new IntegrationQueueProcessor(
      {} as never,
      { collectInverter } as never,
      { evaluateAbsence } as never,
    );
    const result = await processor.process({
      name: 'EVALUATE_MONITORING_ALERTS',
      data: { inverterId: '', reason: 'SCHEDULED' },
      attemptsMade: 0,
    } as never);
    expect(collectInverter).not.toHaveBeenCalled();
    expect(evaluateAbsence).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, evaluated: 1 });
  });

  it('não registra secrets nos logs de erro', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const processor = new IntegrationQueueProcessor({} as never, {
      collectInverter: jest.fn().mockRejectedValue(collectionFailed()),
    } as never);
    await processor.process(job({ inverterId: 'i1', password: 'secret', token: 'abc' }) as never).catch(() => undefined);
    const serialized = JSON.stringify(info.mock.calls);
    expect(serialized).not.toMatch(/Authorization|password|pdb100623/);
    info.mockRestore();
  });
});
