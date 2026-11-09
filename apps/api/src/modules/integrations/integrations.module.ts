import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';
import { AuxsolController } from './auxsol/auxsol.controller';
import { AuxsolIntegrationService } from './auxsol/auxsol.service';
import { IntegrationBindingController } from './binding/integration-binding.controller';
import { IntegrationBindingService } from './binding/integration-binding.service';
import { CollectionController } from './collection/collection.controller';
import { IntegrationCollectionService } from './collection/integration.collection.service';
import { MonitoringPersistenceService } from './collection/monitoring.persistence.service';
import { ManufacturersController } from './manufacturers.controller';
import { ManufacturersService } from './manufacturers.service';
import { CollectionEligibilityService } from './queue/collection-eligibility.service';
import { IntegrationCollectionScheduler } from './queue/integration-collection.scheduler';
import { IntegrationQueueProcessor } from './queue/integration-queue.processor';
import { IntegrationQueueService } from './queue/integration-queue.service';
import { RedisConnectionService } from './queue/redis.connection';

@Module({
  imports: [AlertsModule, AuthModule],
  controllers: [
    ManufacturersController,
    AuxsolController,
    CollectionController,
    IntegrationBindingController,
  ],
  providers: [
    ManufacturersService,
    AuxsolIntegrationService,
    IntegrationBindingService,
    IntegrationCollectionService,
    MonitoringPersistenceService,
    RedisConnectionService,
    IntegrationQueueService,
    IntegrationQueueProcessor,
    CollectionEligibilityService,
    IntegrationCollectionScheduler,
  ],
  exports: [
    ManufacturersService,
    AuxsolIntegrationService,
    IntegrationBindingService,
    IntegrationCollectionService,
    RedisConnectionService,
    IntegrationQueueService,
  ],
})
export class IntegrationsModule {}
