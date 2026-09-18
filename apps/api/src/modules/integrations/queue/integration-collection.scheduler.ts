import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CollectionEligibilityService } from './collection-eligibility.service';
import { collectionEnabled, collectionIntervalSeconds } from './integration-queue.constants';
import { IntegrationQueueProcessor } from './integration-queue.processor';
import { IntegrationQueueService } from './integration-queue.service';

@Injectable()
export class IntegrationCollectionScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly eligibility: CollectionEligibilityService,
    private readonly queue: IntegrationQueueService,
    private readonly processor: IntegrationQueueProcessor,
  ) {}

  onModuleInit() {
    if (!collectionEnabled()) return;
    const intervalMs = collectionIntervalSeconds() * 1000;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    try {
      this.processor.ensureWorker();
      if (!this.queue.isReady()) {
        console.info({ scope: 'COLLECTION', event: 'scheduler skipped', reason: 'REDIS_UNAVAILABLE' });
        return { enqueued: 0, skipped: true };
      }
      const inverterIds = await this.eligibility.listEligibleInverterIds();
      const results = await this.queue.enqueueMany(inverterIds, 'SCHEDULED');
      const alerts = await this.queue.enqueueAlertEvaluation('SCHEDULED');
      console.info({
        scope: 'COLLECTION',
        event: 'scheduler tick',
        eligible: inverterIds.length,
        enqueued: results.filter((item) => item.ok && !item.skipped).length,
        alertJob: alerts.skipped ? 'duplicate' : alerts.ok ? 'enqueued' : alerts.reason,
      });
      return { eligible: inverterIds.length, results, alerts };
    } catch (error) {
      console.error({
        scope: 'COLLECTION',
        event: 'scheduler tick failed',
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      return { enqueued: 0, skipped: true, reason: 'TICK_FAILED' };
    }
  }
}
