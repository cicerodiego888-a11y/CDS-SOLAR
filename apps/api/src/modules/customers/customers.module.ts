import { Module } from '@nestjs/common';
import { ConsumerUnitsModule } from '../consumer-units/consumer-units.module';
import { CustomerConsumerService } from './customer-consumer.service';
import { CustomerConsumerUnitsService } from './customer-consumer-units.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [ConsumerUnitsModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerConsumerService, CustomerConsumerUnitsService],
})
export class CustomersModule {}
