import { Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, UnrecoverableError, Worker } from 'bullmq';
import { Optional } from '@nestjs/common';
import { AlertsService } from '../../alerts/alerts.service';
import { CollectionError } from '../collection/collection.errors';
import { IntegrationCollectionService } from '../collection/integration.collection.service';
import { CollectionErrorCode } from '../integration.contract';
import {
  COLLECT_INVERTER_JOB,
  EVALUATE_MONITORING_ALERTS_JOB,
  INTEGRATION_QUEUE_NAME,
  collectionConcurrency,
  collectionEnabled,
} from './integration-queue.constants';
import { CollectInverterJob } from './integration-queue.types';
import { bullmqConnection, RedisConnectionService } from './redis.connection';
import { omitSensitiveKeys } from '../security.redact';

const NON_RETRYABLE: CollectionErrorCode[] = [
  'INTEGRATION_BLOCKED',
  'INTEGRATION_NOT_CONFIGURED',
  'INTEGRATION_NOT_SUPPORTED',
  'INVALID_READING',
  // Conflito transitório de lock: não retentar nesta execução; próximo tick agenda nova coleta.
  'CONCURRENT_COLLECTION',
];

@Injectable()
export class IntegrationQueueProcessor implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<CollectInverterJob> | null = null;

  constructor(
    private readonly redis: RedisConnectionService,
    private readonly collection: IntegrationCollectionService,
    @Optional() private readonly alerts?: AlertsService,
  ) {}

  async onModuleInit() {
    this.ensureWorker();
  }

  ensureWorker() {
    if (this.worker || !collectionEnabled() || !this.redis.isReady()) return;
    this.worker = new Worker<CollectInverterJob>(
      INTEGRATION_QUEUE_NAME,
      (job) => this.process(job),
      { connection: bullmqConnection(), concurrency: collectionConcurrency() },
    );
  }

  async onModuleDestroy() {
    await this.worker?.close().catch(() => undefined);
    this.worker = null;
  }

  async process(job: Job<CollectInverterJob>) {
    if (job.name === EVALUATE_MONITORING_ALERTS_JOB) {
      this.log({ event: 'job started', job: EVALUATE_MONITORING_ALERTS_JOB, reason: job.data?.reason });
      const result = await this.alerts?.evaluateAbsence();
      this.log({ event: 'success', job: EVALUATE_MONITORING_ALERTS_JOB, readings: result?.length ?? 0 });
      return { ok: true, evaluated: result?.length ?? 0 };
    }

    const inverterId = job.data?.inverterId?.trim();
    if (!inverterId) throw new UnrecoverableError('INVALID_PAYLOAD');

    this.log({ event: 'job started', job: COLLECT_INVERTER_JOB, inverterId, reason: job.data.reason, attempt: job.attemptsMade + 1 });
    try {
      const result = await this.collection.collectInverter(inverterId);
      this.log({
        event: 'success',
        inverterId,
        provider: result.provider,
        readings: result.readings,
        persisted: result.persisted,
      });
      return result;
    } catch (error) {
      if (error instanceof CollectionError && NON_RETRYABLE.includes(error.code)) {
        this.log({ event: 'job completed', inverterId, errorCode: error.code });
        return { ok: false, code: error.code, message: error.message, persisted: 0, readings: 0 };
      }
      if (error instanceof NotFoundException) {
        throw new UnrecoverableError('INVERTER_NOT_FOUND');
      }
      this.log({
        event: 'job failed',
        inverterId,
        errorCode: error instanceof CollectionError ? error.code : error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }

  private log(fields: Record<string, string | number | boolean | undefined>) {
    console.info({ scope: 'COLLECTION', ...omitSensitiveKeys(fields) });
  }
}
