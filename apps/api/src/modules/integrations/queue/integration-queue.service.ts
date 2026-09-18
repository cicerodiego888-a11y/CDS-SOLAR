import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import {
  COLLECT_INVERTER_JOB,
  COLLECT_JOB_ATTEMPTS,
  COLLECT_JOB_BACKOFF_MS,
  EVALUATE_ALERTS_JOB_ID,
  EVALUATE_MONITORING_ALERTS_JOB,
  INTEGRATION_QUEUE_NAME,
  collectJobId,
} from './integration-queue.constants';
import { CollectInverterJob, CollectJobReason, QueueEnqueueResult, QueueSnapshot } from './integration-queue.types';
import { bullmqConnection, RedisConnectionService } from './redis.connection';

const BLOCKING_STATES = new Set(['waiting', 'active', 'delayed', 'paused', 'waiting-children']);

const defaultJobOptions: JobsOptions = {
  attempts: COLLECT_JOB_ATTEMPTS,
  backoff: { type: 'exponential', delay: COLLECT_JOB_BACKOFF_MS },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 200 },
};

@Injectable()
export class IntegrationQueueService implements OnModuleInit, OnModuleDestroy {
  private queue: Queue<CollectInverterJob> | null = null;

  constructor(private readonly redis: RedisConnectionService) {}

  async onModuleInit() {
    this.ensureQueue();
  }

  async onModuleDestroy() {
    await this.queue?.close().catch(() => undefined);
    this.queue = null;
  }

  isReady() {
    return Boolean(this.ensureQueue()) && this.redis.isReady();
  }

  private ensureQueue() {
    if (this.queue) return this.queue;
    if (!this.redis.isReady()) return null;
    this.queue = new Queue<CollectInverterJob>(INTEGRATION_QUEUE_NAME, {
      connection: bullmqConnection(),
      defaultJobOptions,
    });
    return this.queue;
  }

  async enqueueCollect(inverterId: string, reason: CollectJobReason = 'SCHEDULED'): Promise<QueueEnqueueResult> {
    const id = inverterId?.trim();
    if (!id) return { ok: false, reason: 'INVALID_PAYLOAD' };
    const queue = this.ensureQueue();
    if (!queue || !this.redis.isReady()) return { ok: false, reason: 'REDIS_UNAVAILABLE' };

    const jobId = collectJobId(id);
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (BLOCKING_STATES.has(state)) {
        return { ok: true, jobId, skipped: true, reason: 'DUPLICATE' };
      }
      await existing.remove().catch(() => undefined);
    }

    try {
      await queue.add(COLLECT_INVERTER_JOB, { inverterId: id, reason }, { ...defaultJobOptions, jobId });
      return { ok: true, jobId };
    } catch (error) {
      console.error({
        scope: 'COLLECTION',
        event: 'enqueue failed',
        inverterId: id,
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      return { ok: false, jobId, reason: 'ENQUEUE_FAILED' };
    }
  }

  async enqueueAlertEvaluation(reason: CollectJobReason = 'SCHEDULED'): Promise<QueueEnqueueResult> {
    const queue = this.ensureQueue();
    if (!queue || !this.redis.isReady()) return { ok: false, reason: 'REDIS_UNAVAILABLE' };
    const existing = await queue.getJob(EVALUATE_ALERTS_JOB_ID);
    if (existing) {
      const state = await existing.getState();
      if (BLOCKING_STATES.has(state)) {
        return { ok: true, jobId: EVALUATE_ALERTS_JOB_ID, skipped: true, reason: 'DUPLICATE' };
      }
      await existing.remove().catch(() => undefined);
    }
    try {
      await queue.add(EVALUATE_MONITORING_ALERTS_JOB, { inverterId: '', reason } as CollectInverterJob, {
        ...defaultJobOptions,
        jobId: EVALUATE_ALERTS_JOB_ID,
      });
      return { ok: true, jobId: EVALUATE_ALERTS_JOB_ID };
    } catch (error) {
      console.error({
        scope: 'COLLECTION',
        event: 'alert enqueue failed',
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      return { ok: false, jobId: EVALUATE_ALERTS_JOB_ID, reason: 'ENQUEUE_FAILED' };
    }
  }

  async enqueueMany(inverterIds: string[], reason: CollectJobReason = 'SCHEDULED') {
    const results = [];
    for (const inverterId of inverterIds) {
      results.push(await this.enqueueCollect(inverterId, reason));
    }
    return results;
  }

  async snapshot(): Promise<QueueSnapshot> {
    const queue = this.ensureQueue();
    if (!queue || !this.redis.isReady()) {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, redis: 'down' };
    }
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      redis: 'ok',
    };
  }
}
