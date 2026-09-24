import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Permissions } from '../auth/permissions.decorator';
import {
  CreateCustomerConsumerDto,
  CreateCustomerConsumerUnitDto,
  CreateCustomerDto,
  StatusDto,
  UpdateCustomerConsumerDto,
  UpdateCustomerDto,
} from '../common/dto';
import { CustomerConsumerService } from './customer-consumer.service';
import { CustomerConsumerUnitsService } from './customer-consumer-units.service';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(
    private service: CustomersService,
    private energy: CustomerConsumerService,
    private units: CustomerConsumerUnitsService,
  ) {}

  @Permissions('CUSTOMERS_VIEW')
  @Get()
  findAll() { return this.service.findAll(); }

  @Permissions('CUSTOMERS_VIEW')
  @Get(':id/consumer')
  async findConsumer(@Param('id') id: string) {
    return { consumer: await this.energy.findByCustomer(id) };
  }

  @Permissions('CUSTOMERS_VIEW')
  @Get(':id/consumer-units')
  listConsumerUnits(@Param('id') id: string) {
    return this.units.listByCustomer(id);
  }

  @Permissions('CUSTOMERS_VIEW')
  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Permissions('CUSTOMERS_CREATE')
  @Post()
  create(@Body() dto: CreateCustomerDto) { return this.service.create(dto); }

  @Permissions('CUSTOMERS_UPDATE')
  @Post(':id/consumer')
  createConsumer(@Param('id') id: string, @Body() dto: CreateCustomerConsumerDto) {
    return this.energy.createForCustomer(id, dto);
  }

  @Permissions('CUSTOMERS_UPDATE')
  @Post(':id/consumer-units')
  createConsumerUnit(@Param('id') id: string, @Body() dto: CreateCustomerConsumerUnitDto) {
    return this.units.createForCustomer(id, dto);
  }

  @Permissions('CUSTOMERS_UPDATE')
  @Patch(':id/consumer')
  updateConsumer(@Param('id') id: string, @Body() dto: UpdateCustomerConsumerDto) {
    return this.energy.updateForCustomer(id, dto);
  }

  @Permissions('CUSTOMERS_UPDATE')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: StatusDto) { return this.service.updateStatus(id, dto); }

  @Permissions('CUSTOMERS_UPDATE')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) { return this.service.update(id, dto); }
}
