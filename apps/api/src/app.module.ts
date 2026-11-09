import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { PlantsModule } from './modules/plants/plants.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { InvertersModule } from './modules/inverters/inverters.module';
import { EquipmentModule } from './modules/equipment/equipment.module';
import { OperationsModule } from './modules/operations/operations.module';
import { RateLimitModule } from './modules/auth/rate-limit.module';
import { DistributorsModule } from './modules/distributors/distributors.module';
import { ConsumersModule } from './modules/consumers/consumers.module';
import { ConsumerUnitsModule } from './modules/consumer-units/consumer-units.module';
import { EnergyModule } from './modules/energy/energy.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    CustomersModule,
    PlantsModule,
    MonitoringModule,
    AlertsModule,
    IntegrationsModule,
    InvertersModule,
    EquipmentModule,
    OperationsModule,
    RateLimitModule,
    DistributorsModule,
    ConsumersModule,
    ConsumerUnitsModule,
    EnergyModule,
  ],
})
export class AppModule {}