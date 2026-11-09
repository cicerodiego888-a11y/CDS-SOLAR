import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { EnergyAllocationService } from './energy-allocation.service';
import { EnergyConsumptionService } from './energy-consumption.service';
import { EnergyConsumptionStore, UnavailableEnergyConsumptionStore } from './energy-consumption.store';
import { EnergyController } from './energy.controller';
import { EnergyManagementService } from './energy-management.service';
import { RateioController } from './rateio.controller';
import { RateioService } from './rateio.service';

@Module({
  imports: [AuthModule, MonitoringModule],
  controllers: [EnergyController, RateioController],
  providers: [
    EnergyManagementService,
    EnergyConsumptionService,
    EnergyAllocationService,
    RateioService,
    { provide: EnergyConsumptionStore, useClass: UnavailableEnergyConsumptionStore },
  ],
  exports: [EnergyManagementService, EnergyConsumptionService, EnergyAllocationService, RateioService],
})
export class EnergyModule {}
