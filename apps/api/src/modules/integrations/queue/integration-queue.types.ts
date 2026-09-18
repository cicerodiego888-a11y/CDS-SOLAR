export type CollectJobReason = 'SCHEDULED' | 'MANUAL' | 'RETRY';

export interface CollectInverterJob {
  inverterId: string;
  reason?: CollectJobReason;
}

export interface QueueEnqueueResult {
  ok: boolean;
  jobId?: string;
  skipped?: boolean;
  reason?: 'REDIS_UNAVAILABLE' | 'DUPLICATE' | 'INVALID_PAYLOAD' | 'ENQUEUE_FAILED';
}

export interface QueueSnapshot {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  redis: 'ok' | 'down';
}
