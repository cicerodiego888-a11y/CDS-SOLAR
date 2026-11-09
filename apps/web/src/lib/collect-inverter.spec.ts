import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  COLLECTION_IN_PROGRESS_MESSAGE,
  collectInverterLive,
  isCollectInFlight,
  isConcurrentCollectionError,
  resetCollectInverterDedupeForTests,
} from './collect-inverter.ts';

class FakeApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

describe('collectInverterLive — deduplicação', () => {
  beforeEach(() => {
    resetCollectInverterDedupeForTests();
  });

  it('1) Strict Mode / duas chamadas simultâneas compartilham uma única Promise', async () => {
    let calls = 0;
    const fetchCollect = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true, liveReading: { available: true, powerKw: 1 } as never };
    };
    const a = collectInverterLive('inv-1', fetchCollect);
    const b = collectInverterLive('inv-1', fetchCollect);
    assert.equal(a, b);
    assert.equal(isCollectInFlight('inv-1'), true);
    const [ra, rb] = await Promise.all([a, b]);
    assert.equal(calls, 1);
    assert.equal(ra.status, 'ok');
    assert.equal(rb.status, 'ok');
    assert.equal(isCollectInFlight('inv-1'), false);
  });

  it('2) dois solicitantes do mesmo inverterId compartilham a chamada pendente', async () => {
    let calls = 0;
    const fetchCollect = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return { ok: true, liveReading: null };
    };
    const results = await Promise.all([
      collectInverterLive('shared', fetchCollect),
      collectInverterLive('shared', fetchCollect),
      collectInverterLive('shared', fetchCollect),
    ]);
    assert.equal(calls, 1);
    assert.ok(results.every((item) => item.status === 'ok'));
  });

  it('3) inversores diferentes coletam independentemente', async () => {
    const seen: string[] = [];
    const fetchCollect = async (path: string) => {
      const id = path.split('/').pop()!;
      seen.push(id);
      await new Promise((r) => setTimeout(r, 15));
      return { ok: true, liveReading: null };
    };
    await Promise.all([
      collectInverterLive('inv-a', fetchCollect),
      collectInverterLive('inv-b', fetchCollect),
    ]);
    assert.deepEqual(seen.sort(), ['inv-a', 'inv-b']);
  });

  it('4) segundo disparo durante in-flight não cria nova HTTP (Atualizar/duplicidade)', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchCollect = async () => {
      calls += 1;
      await gate;
      return { ok: true, liveReading: null };
    };
    const first = collectInverterLive('inv-btn', fetchCollect);
    const second = collectInverterLive('inv-btn', fetchCollect);
    assert.equal(isCollectInFlight('inv-btn'), true);
    release();
    await Promise.all([first, second]);
    assert.equal(calls, 1);
  });

  it('5/6) HTTP 409 / CONCURRENT_COLLECTION → mensagem de coleta em andamento, não falha AUXSOL', async () => {
    const fetchCollect = async () => {
      throw new FakeApiError(409, 'Já existe uma coleta em andamento para este inversor.', 'CONCURRENT_COLLECTION');
    };
    const outcome = await collectInverterLive('inv-lock', fetchCollect);
    assert.equal(outcome.status, 'concurrent');
    assert.equal(outcome.status === 'concurrent' && outcome.message, COLLECTION_IN_PROGRESS_MESSAGE);
    assert.equal(/AUXSOL/i.test(COLLECTION_IN_PROGRESS_MESSAGE), false);
    assert.ok(isConcurrentCollectionError(
      new FakeApiError(409, 'Já existe uma coleta em andamento para este inversor.', 'CONCURRENT_COLLECTION'),
    ));
  });

  it('7) Promise concluída libera a deduplicação', async () => {
    const fetchCollect = async () => ({ ok: true, liveReading: null });
    await collectInverterLive('inv-done', fetchCollect);
    assert.equal(isCollectInFlight('inv-done'), false);
    let calls = 0;
    await collectInverterLive('inv-done', async () => {
      calls += 1;
      return { ok: true, liveReading: null };
    });
    assert.equal(calls, 1);
  });

  it('8) Promise rejeitada (erro) também libera a deduplicação', async () => {
    const fetchCollect = async () => {
      throw new FakeApiError(500, 'Falha interna', 'INTERNAL_SERVER_ERROR');
    };
    const first = await collectInverterLive('inv-err', fetchCollect);
    assert.equal(first.status, 'error');
    assert.equal(isCollectInFlight('inv-err'), false);
    let calls = 0;
    await collectInverterLive('inv-err', async () => {
      calls += 1;
      return { ok: true, liveReading: null };
    });
    assert.equal(calls, 1);
  });

  it('Diagnosticar/Sincronizar: dois acionamentos = uma coleta efetiva', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchCollect = async () => {
      calls += 1;
      await gate;
      return {
        ok: true,
        liveReading: {
          available: true,
          collectedAt: '2026-11-08T16:34:41.000Z',
          lastCommAt: '2026-11-08T16:34:41.000Z',
          powerKw: 0,
        } as never,
        persisted: 1,
      };
    };
    // Simula effect de mount + clique em Sincronizar/Diagnosticar.
    const fromEffect = collectInverterLive('cmw76di320001tyys55mvm5ex', fetchCollect);
    const fromButton = collectInverterLive('cmw76di320001tyys55mvm5ex', fetchCollect);
    assert.equal(fromEffect, fromButton);
    release();
    const [a, b] = await Promise.all([fromEffect, fromButton]);
    assert.equal(calls, 1);
    assert.equal(a.status, 'ok');
    assert.equal(b.status, 'ok');
  });
});
