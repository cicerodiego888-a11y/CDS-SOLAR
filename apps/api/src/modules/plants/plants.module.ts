import { Module } from '@nestjs/common';
import { LegacyPlantAuditService } from './legacy-plant-audit.service';
import { OperationalIdentityAuditService } from './operational-identity-audit.service';
import { PlantsController } from './plants.controller';
import { PlantsService } from './plants.service';

@Module({
  controllers: [PlantsController],
  providers: [PlantsService, LegacyPlantAuditService, OperationalIdentityAuditService],
  exports: [LegacyPlantAuditService, OperationalIdentityAuditService],
})
export class PlantsModule {}
