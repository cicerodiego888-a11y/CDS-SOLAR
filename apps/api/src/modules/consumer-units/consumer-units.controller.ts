import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { CreateConsumerUnitDto, StatusDto, UpdateConsumerUnitDto } from '../common/dto';
import { ConsumerUnitsService } from './consumer-units.service';

@Controller('consumer-units')
export class ConsumerUnitsController {
  constructor(private service: ConsumerUnitsService) {}

  @Permissions('CONSUMER_UNITS_VIEW')
  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('number') number?: string,
    @Query('distributorId') distributorId?: string,
    @Query('consumerId') consumerId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll({ number, distributorId, consumerId, status }, user);
  }

  @Permissions('CONSUMER_UNITS_VIEW')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user);
  }

  @Permissions('CONSUMER_UNITS_CREATE')
  @Post()
  create(@Body() dto: CreateConsumerUnitDto, @CurrentUser() user: JwtPayload) {
    return this.service.createForUser(dto, user);
  }

  @Permissions('CONSUMER_UNITS_UPDATE')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: StatusDto, @CurrentUser() user: JwtPayload) {
    return this.service.updateStatus(id, dto, user);
  }

  @Permissions('CONSUMER_UNITS_UPDATE')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateConsumerUnitDto, @CurrentUser() user: JwtPayload) {
    return this.service.update(id, dto, user);
  }
}
