export const COLLECT_INVERTER_JOB = 'COLLECT_INVERTER';
export const EVALUATE_MONITORING_ALERTS_JOB = 'EVALUATE_MONITORING_ALERTS';
export const EVALUATE_ALERTS_JOB_ID = 'evaluate-monitoring-alerts';
export const INTEGRATION_QUEUE_NAME = 'b7-integrations';
export const COLLECT_JOB_ATTEMPTS = 3;
export const COLLECT_JOB_BACKOFF_MS = 2000;

/** BullMQ 6 rejeita custom jobId com `:` (exceto o formato antigo a:b:c). */
export function collectJobId(inverterId: string) {
  return `collect-inverter_${inverterId.replace(/:/g, '-')}`;
}

export function collectionIntervalSeconds() {
  const parsed = Number(process.env.MONITORING_COLLECTION_INTERVAL_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
}

export function collectionConcurrency() {
  const parsed = Number(process.env.MONITORING_COLLECTION_CONCURRENCY);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

export function collectionEnabled() {
  return process.env.MONITORING_COLLECTION_ENABLED !== 'false';
}

export function redisConnectionOptions() {
  const password = process.env.REDIS_PASSWORD?.trim();
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    ...(password ? { password } : {}),
  };
}
