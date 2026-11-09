import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConsumerUnitsController } from './consumer-units.controller';
import { ConsumerUnitsService } from './consumer-units.service';

@Module({
  imports: [AuthModule],
  controllers: [ConsumerUnitsController],
  providers: [ConsumerUnitsService],
  exports: [ConsumerUnitsService],
})
export class ConsumerUnitsModule {}
