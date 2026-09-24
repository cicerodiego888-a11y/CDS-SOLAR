import { Module } from '@nestjs/common';
import { ConsumerUnitsController } from './consumer-units.controller';
import { ConsumerUnitsService } from './consumer-units.service';

@Module({
  controllers: [ConsumerUnitsController],
  providers: [ConsumerUnitsService],
  exports: [ConsumerUnitsService],
})
export class ConsumerUnitsModule {}
