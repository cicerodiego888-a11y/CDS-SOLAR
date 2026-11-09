import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtPayload } from '../../auth/auth.types';
import { Permissions } from '../../auth/permissions.decorator';
import {
  CreateBindingDto,
  IntegrationBindingService,
  ValidateBindingDto,
} from './integration-binding.service';

@Controller('inverters/:inverterId/integration-binding')
export class IntegrationBindingController {
  constructor(private readonly service: IntegrationBindingService) {}

  @Permissions('INVERTERS_VIEW', 'SETTINGS_VIEW')
  @Get()
  get(@Param('inverterId') inverterId: string, @CurrentUser() user: JwtPayload) {
    return this.service.get(inverterId, user);
  }

  @Permissions('INVERTERS_UPDATE', 'SETTINGS_VIEW')
  @Post('validate')
  validate(
    @Param('inverterId') inverterId: string,
    @Body() dto: ValidateBindingDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.validate(inverterId, dto, user);
  }

  @Permissions('INVERTERS_UPDATE', 'SETTINGS_VIEW')
  @Post()
  create(
    @Param('inverterId') inverterId: string,
    @Body() dto: CreateBindingDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(inverterId, dto, user);
  }

  @Permissions('INVERTERS_UPDATE', 'SETTINGS_VIEW')
  @Delete()
  remove(@Param('inverterId') inverterId: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(inverterId, user);
  }
}
