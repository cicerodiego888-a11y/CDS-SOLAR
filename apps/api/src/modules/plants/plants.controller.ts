import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Permissions } from '../auth/permissions.decorator';
import { CreatePlantDto, LinkPlantConsumerUnitDto, PlantStatusDto, UpdatePlantDto } from '../common/dto';
import { LegacyPlantAuditService } from './legacy-plant-audit.service';
import { OperationalIdentityAuditService } from './operational-identity-audit.service';
import { PlantsService } from './plants.service';

@Controller('plants')
export class PlantsController {
  constructor(
    private service: PlantsService,
    private audit: LegacyPlantAuditService,
    private identityAudit: OperationalIdentityAuditService,
  ) {}

  @Permissions('PLANTS_VIEW')
  @Get()
  findAll() { return this.service.findAll(); }

  @Permissions('PLANTS_VIEW')
  @Get('legacy-audit')
  legacyAudit() { return this.audit.buildReport(); }

  @Permissions('PLANTS_VIEW')
  @Get('operational-identity-audit')
  operationalIdentityAudit() { return this.identityAudit.buildReport(); }

  @Permissions('PLANTS_VIEW')
  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Permissions('PLANTS_CREATE')
  @Post()
  create(@Body() dto: CreatePlantDto) { return this.service.create(dto); }

  @Permissions('PLANTS_UPDATE')
  @Post(':id/consumer-unit')
  linkConsumerUnit(@Param('id') id: string, @Body() dto: LinkPlantConsumerUnitDto) {
    return this.service.linkConsumerUnit(id, dto);
  }

  @Permissions('PLANTS_UPDATE')
  @Delete(':id/consumer-unit')
  unlinkConsumerUnit(@Param('id') id: string) {
    return this.service.unlinkConsumerUnit(id);
  }

  @Permissions('PLANTS_UPDATE')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: PlantStatusDto) { return this.service.updateStatus(id, dto); }

  @Permissions('PLANTS_UPDATE')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlantDto) { return this.service.update(id, dto); }
}
