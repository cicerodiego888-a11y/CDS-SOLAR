import { Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { IntegrationBindingStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { CollectionLiveReading, CollectionResult } from '../integration.contract';
import { createDefaultIntegrationEngine, IntegrationEngine } from '../integration.engine';
import {
  collectionFailed,
  concurrentCollection,
  integrationBlocked,
  integrationNotConfigured,
  integrationNotSupported,
  persistenceFailed,
} from './collection.errors';
import { isReadingPersistAllowed } from './auxsol-persist-scope';
import { InProcessCollectionLock } from './collection.lock';
import { buildLiveReadingView } from './live-reading.view';
import { MonitoringPersistenceService } from './monitoring.persistence.service';
import { validateNormalizedReading } from './reading.validator';
import { MonitoringAlertService } from '../../alerts/alert.engine';
import { omitSensitiveKeys } from '../security.redact';
import { RedisConnectionService } from '../queue/redis.connection';

@Injectable()
export class IntegrationCollectionService {
  private engine = createDefaultIntegrationEngine();
  private readonly lock = new InProcessCollectionLock();

  constructor(
    private readonly prisma: PrismaService,
    private readonly persistence: MonitoringPersistenceService,
    @Optional() private readonly alerts?: MonitoringAlertService,
    @Optional() private readonly redis?: RedisConnectionService,
  ) {}

  useEngine(engine: IntegrationEngine) {
    this.engine = engine;
    return this;
  }

  async collectInverter(inverterId: string): Promise<CollectionResult> {
    const key = `collect-lock:${inverterId}`;
    const token = this.redis
      ? await this.acquireDistributedLock(key)
      : null;
    if (this.redis ? !token : !this.lock.tryAcquire(inverterId)) throw concurrentCollection();
    const started = Date.now();
    try {
      return await this.execute(inverterId, started);
    } finally {
      if (token) await this.redis?.releaseLock(key, token);
      else this.lock.release(inverterId);
    }
  }

  private async acquireDistributedLock(key: string) {
    if (!this.redis?.isReady()) throw new ServiceUnavailableException('Redis indisponível para coordenar a coleta.');
    return this.redis.acquireLock(key, Number(process.env.MONITORING_COLLECTION_LOCK_TTL_MS) || 30_000);
  }

  private async execute(inverterId: string, started: number): Promise<CollectionResult> {
    const inverter = await this.prisma.inverter.findUnique({
      where: { id: inverterId },
      include: { manufacturerRef: true, bindings: true, plant: true },
    });
    if (!inverter) throw new NotFoundException('Inversor não encontrado.');

    const manufacturerCode = inverter.manufacturerRef?.code ?? inverter.manufacturer;
    const binding = inverter.bindings.find((item) => item.provider === manufacturerCode) ?? inverter.bindings[0];
    if (!binding) throw integrationNotConfigured();
    if (binding.provider !== manufacturerCode) {
      throw integrationNotConfigured();
    }

    const adapter = this.engine.resolve(binding.provider);
    if (!adapter) throw integrationNotSupported();
    if (!adapter.capabilities().includes('collect')) throw integrationNotSupported();

    const runtime = adapter.runtimeState();
    if (!runtime.available) throw integrationNotSupported();
    if (runtime.mode === 'blocked') {
      await this.markBinding(binding.id, {
        status: IntegrationBindingStatus.NOT_CONFIGURED,
        lastErrorAt: new Date(),
        lastErrorMessage: 'Integração bloqueada até o contrato oficial.',
      });
      throw integrationBlocked();
    }

    try {
      const readings = await adapter.collect({
        inverterId: inverter.id,
        serialNumber: inverter.serialNumber ?? undefined,
        externalId: binding.externalId ?? inverter.externalId ?? undefined,
      });
      const valid = readings.filter(validateNormalizedReading);
      const skippedInvalid = readings.length - valid.length;

      // Persistência efetiva: flag do adapter + allowlist AUXSOL (escopo Ulisses nesta sprint).
      const persistThis = isReadingPersistAllowed({
        provider: adapter.provider,
        inverterId: inverter.id,
        runtimePersistable: runtime.persistable,
      });

      let persisted = 0;
      if (persistThis) {
        const stored = await this.persistence.persist(inverter.plantId, inverter.id, adapter.provider, readings);
        persisted = stored.persisted;
      } else {
        persisted = 0;
      }

      // lastSyncAt registra coleta bem-sucedida mesmo sem persistência (proxy de leitura recente).
      const lastSyncAt = valid[0]?.collectedAt
        ?? (persistThis && readings.length === 0 ? new Date() : undefined);

      await this.markBinding(binding.id, {
        status: persistThis ? IntegrationBindingStatus.CONNECTED : IntegrationBindingStatus.READY,
        lastSyncAt,
        lastErrorAt: persistThis ? null : undefined,
        lastErrorMessage: runtime.mode === 'mock'
          ? 'Coleta executada em modo de fixture interno. Dados não foram persistidos como monitoramento real.'
          : null,
        externalId: readings[0]?.externalInverterId ?? binding.externalId,
      });

      // COERENCIA-03: evaluateAfterCollection somente quando a leitura foi efetivamente persistível neste inversor.
      if (this.alerts && persistThis && valid[0]) {
        await this.alerts.evaluateAfterCollection({
          inverterId: inverter.id,
          inverterName: inverter.model,
          plantId: inverter.plantId,
          plantName: inverter.plant?.name,
          status: valid[0].status,
          collectedAt: valid[0].collectedAt,
          lastReadingAt: valid[0].collectedAt,
          persistedLastReadingAt: valid[0].collectedAt,
          readingValid: true,
          collectability: 'COLLECTABLE',
          provider: adapter.provider,
        }).catch((error) => {
          this.log({
            operation: 'alert-eval',
            status: 'error',
            inverterId,
            errorCode: error instanceof Error ? error.name : 'unknown',
          });
        });
      }

      const liveReading = buildLiveReadingView({
        readings,
        valid,
        persisted: persisted > 0,
        emptyReason: readings.length === 0
          ? 'Coleta realizada sem dados de telemetria.'
          : undefined,
      });

      this.log({
        integration: adapter.provider.toLowerCase(),
        operation: 'collect',
        inverterId,
        status: 'success',
        readings: readings.length,
        persisted,
        persistScoped: persistThis,
        liveAvailable: liveReading.available,
        durationMs: Date.now() - started,
      });

      return this.result({
        ok: true,
        inverterId,
        provider: adapter.provider,
        integrationId: binding.id,
        mode: runtime.mode,
        readings: readings.length,
        valid: valid.length,
        persisted,
        skipped: persistThis ? skippedInvalid : readings.length,
        lastSyncAt: lastSyncAt?.toISOString() ?? binding.lastSyncAt?.toISOString() ?? null,
        started,
        liveReading,
        message: runtime.mode === 'mock'
          ? 'Coleta de fixture concluída. Nenhum dado fictício foi gravado no monitoramento.'
          : readings.length === 0
            ? 'Coleta realizada sem dados.'
            : persistThis
              ? 'Sincronização concluída.'
              : 'Leitura ao vivo obtida. Persistência desabilitada nesta configuração.',
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.log({
        integration: adapter.provider.toLowerCase(),
        operation: 'collect',
        inverterId,
        status: 'error',
        errorCode: error instanceof Error ? error.name : 'unknown',
        durationMs: Date.now() - started,
      });
      await this.markBinding(binding.id, {
        status: IntegrationBindingStatus.COMMUNICATION_ERROR,
        lastErrorAt: new Date(),
        lastErrorMessage: 'Falha técnica registrada no backend. Detalhes não são expostos ao usuário.',
      }).catch(() => undefined);
      if (error instanceof Error && error.name === 'CollectionError') throw error;
      if (error instanceof Error && /prisma|persist/i.test(error.message)) throw persistenceFailed();
      throw collectionFailed();
    }
  }

  private async markBinding(
    id: string,
    data: {
      status: IntegrationBindingStatus;
      lastSyncAt?: Date;
      lastErrorAt?: Date | null;
      lastErrorMessage?: string | null;
      externalId?: string | null;
    },
  ) {
    await this.prisma.integrationBinding.update({
      where: { id },
      data: {
        status: data.status,
        ...(data.lastSyncAt ? { lastSyncAt: data.lastSyncAt } : {}),
        ...(data.lastErrorAt !== undefined ? { lastErrorAt: data.lastErrorAt } : {}),
        ...(data.lastErrorMessage !== undefined ? { lastErrorMessage: data.lastErrorMessage } : {}),
        ...(data.externalId ? { externalId: data.externalId } : {}),
      },
    });
  }

  private result(input: {
    ok: boolean;
    inverterId: string;
    provider?: string;
    integrationId?: string;
    mode?: 'live' | 'mock' | 'blocked';
    readings?: number;
    valid?: number;
    persisted?: number;
    skipped?: number;
    lastSyncAt?: string | null;
    started: number;
    code?: CollectionResult['code'];
    message: string;
    liveReading?: CollectionLiveReading | null;
  }): CollectionResult {
    return {
      ok: input.ok,
      inverterId: input.inverterId,
      provider: input.provider,
      integrationId: input.integrationId,
      mode: input.mode,
      readings: input.readings ?? 0,
      valid: input.valid ?? 0,
      persisted: input.persisted ?? 0,
      skipped: input.skipped ?? 0,
      lastSyncAt: input.lastSyncAt,
      durationMs: Date.now() - input.started,
      code: input.code,
      message: input.message,
      liveReading: input.liveReading ?? null,
    };
  }

  private log(fields: Record<string, string | number | boolean | undefined>) {
    console.info(omitSensitiveKeys(fields));
  }
}
