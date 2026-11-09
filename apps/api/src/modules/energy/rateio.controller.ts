import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Permissions } from '../auth/permissions.decorator';
import { CreateRateioVersionInput, RateioService } from './rateio.service';

@Controller('energy/plants/:plantId/rateios')
export class RateioController {
  constructor(private readonly rateio: RateioService) {}

  @Permissions('ENERGY_VIEW')
  @Get()
  list(@Param('plantId') plantId: string, @CurrentUser() user: JwtPayload) {
    return this.rateio.list(plantId, user);
  }

  @Permissions('ENERGY_VIEW')
  @Get('current')
  current(
    @Param('plantId') plantId: string,
    @CurrentUser() user: JwtPayload,
    @Query('at') at?: string,
  ) {
    return this.rateio.current(plantId, user, at);
  }

  @Permissions('ENERGY_VIEW')
  @Get('history')
  history(@Param('plantId') plantId: string, @CurrentUser() user: JwtPayload) {
    return this.rateio.history(plantId, user);
  }

  @Permissions('ENERGY_UPDATE')
  @Post()
  create(
    @Param('plantId') plantId: string,
    @Body() body: CreateRateioVersionInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.rateio.create(plantId, body, user);
  }

  @Permissions('ENERGY_UPDATE')
  @Post(':rateioId/new-version')
  newVersion(
    @Param('plantId') plantId: string,
    @Param('rateioId') rateioId: string,
    @Body() body: CreateRateioVersionInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.rateio.newVersion(plantId, rateioId, body, user);
  }

  @Permissions('ENERGY_UPDATE')
  @Post(':rateioId/cancel')
  cancel(
    @Param('plantId') plantId: string,
    @Param('rateioId') rateioId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.rateio.cancel(plantId, rateioId, user);
  }
}
