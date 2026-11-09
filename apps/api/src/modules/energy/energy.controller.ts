import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Permissions } from '../auth/permissions.decorator';
import { EnergyAllocationService } from './energy-allocation.service';
import { EnergyConsumptionService } from './energy-consumption.service';
import { EnergyManagementService } from './energy-management.service';

@Controller('energy')
export class EnergyController {
  constructor(
    private readonly energy: EnergyManagementService,
    private readonly consumption: EnergyConsumptionService,
    private readonly allocation: EnergyAllocationService,
  ) {}

  @Permissions('ENERGY_VIEW')
  @Get('plants/:plantId/summary')
  plantSummary(
    @Param('plantId') plantId: string,
    @CurrentUser() user: JwtPayload,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('granularity') granularity?: string,
  ) {
    return this.energy.plantSummary(plantId, { period, startDate, endDate, granularity }, user);
  }

  @Permissions('ENERGY_VIEW')
  @Get('plants/:plantId/generation')
  plantGeneration(
    @Param('plantId') plantId: string,
    @CurrentUser() user: JwtPayload,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('granularity') granularity?: string,
  ) {
    return this.energy.plantGeneration(plantId, { period, startDate, endDate, granularity }, user);
  }

  @Permissions('ENERGY_VIEW')
  @Get('plants/:plantId/allocations')
  plantAllocations(
    @Param('plantId') plantId: string,
    @CurrentUser() user: JwtPayload,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('granularity') granularity?: string,
  ) {
    return this.allocation.plantAllocations(plantId, { period, startDate, endDate, granularity }, user);
  }

  @Permissions('ENERGY_VIEW')
  @Get('plants/:plantId/consumer-units/consumption')
  plantConsumerUnitsConsumption(
    @Param('plantId') plantId: string,
    @CurrentUser() user: JwtPayload,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.consumption.plantConsumerUnitsConsumption(
      plantId,
      { period, startDate, endDate },
      user,
    );
  }

  @Permissions('ENERGY_VIEW')
  @Get('consumer-units/:consumerUnitId/consumption/summary')
  consumerUnitConsumptionSummary(
    @Param('consumerUnitId') consumerUnitId: string,
    @CurrentUser() user: JwtPayload,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.consumption.consumerUnitSummary(
      consumerUnitId,
      { period, startDate, endDate },
      user,
    );
  }

  @Permissions('ENERGY_VIEW')
  @Get('consumer-units/:consumerUnitId/consumption')
  consumerUnitConsumption(
    @Param('consumerUnitId') consumerUnitId: string,
    @CurrentUser() user: JwtPayload,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.consumption.consumerUnitConsumption(
      consumerUnitId,
      { period, startDate, endDate },
      user,
    );
  }

  @Permissions('ENERGY_VIEW')
  @Get('consumer-units/:consumerUnitId/balance-foundation')
  balanceFoundation(
    @Param('consumerUnitId') consumerUnitId: string,
    @CurrentUser() user: JwtPayload,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.consumption.balanceFoundation(
      consumerUnitId,
      { period, startDate, endDate },
      user,
    );
  }
}
