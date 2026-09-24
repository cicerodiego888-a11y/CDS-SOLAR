import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../auth/permissions.decorator';
import { CreateEquipmentDto, StatusDto, UpdateEquipmentDto } from '../common/dto';
import { EquipmentService } from './equipment.service';

@Controller('equipment')
export class EquipmentController {
  constructor(private service: EquipmentService) {}

  @Permissions('EQUIPMENT_VIEW')
  @Get()
  findAll(
    @Query('plantId') plantId?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('inverterId') inverterId?: string,
  ) {
    return this.service.findAll({ plantId, type, status, inverterId });
  }

  @Permissions('EQUIPMENT_VIEW')
  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Permissions('EQUIPMENT_CREATE')
  @Post()
  create(@Body() dto: CreateEquipmentDto) { return this.service.create(dto); }

  @Permissions('EQUIPMENT_UPDATE')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: StatusDto) { return this.service.updateStatus(id, dto); }

  @Permissions('EQUIPMENT_UPDATE')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEquipmentDto) { return this.service.update(id, dto); }
}
