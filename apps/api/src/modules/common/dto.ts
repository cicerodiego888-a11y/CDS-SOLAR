import { IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export const RECORD_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const PLANT_OPERATIONAL_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const EQUIPMENT_TYPES = ['INVERSOR', 'DATALOGGER', 'GATEWAY', 'MEDIDOR', 'COMUNICACAO', 'OUTRO'] as const;
export const DOCUMENT_TYPES = ['CPF', 'CNPJ'] as const;

export class CreateCustomerDto {
  @IsString() @IsNotEmpty({ message: 'Informe o nome do cliente.' })
  name!: string;

  @IsString() @IsNotEmpty({ message: 'Informe o CPF/CNPJ.' })
  document!: string;

  @IsOptional() @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email?: string;

  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsIn(RECORD_STATUSES, { message: 'Status inválido.' })
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'Informe o nome do cliente.' })
  name?: string;

  @IsOptional() @IsString() @IsNotEmpty({ message: 'Informe o CPF/CNPJ.' })
  document?: string;

  @IsOptional() @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email?: string;

  @IsOptional() @IsString()
  phone?: string;
}

export class StatusDto {
  @IsIn(RECORD_STATUSES, { message: 'Status inválido.' })
  status!: 'ACTIVE' | 'INACTIVE';
}

export class CreatePlantDto {
  @IsString() @IsNotEmpty({ message: 'Selecione o cliente.' })
  customerId!: string;

  @IsString() @IsNotEmpty({ message: 'Informe o nome da usina.' })
  name!: string;

  @Type(() => Number) @IsNumber({}, { message: 'Informe a potência instalada.' }) @Min(0, { message: 'A potência deve ser maior ou igual a zero.' })
  installedPowerKw!: number;

  @IsOptional() @IsString()
  distributor?: string;

  @IsOptional() @IsString()
  consumerUnit?: string;

  @IsOptional() @IsString()
  address?: string;

  @IsOptional() @IsIn(PLANT_OPERATIONAL_STATUSES, { message: 'Status inválido.' })
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdatePlantDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'Selecione o cliente.' })
  customerId?: string;

  @IsOptional() @IsString() @IsNotEmpty({ message: 'Informe o nome da usina.' })
  name?: string;

  @IsOptional() @Type(() => Number) @IsNumber({}, { message: 'Informe a potência instalada.' }) @Min(0, { message: 'A potência deve ser maior ou igual a zero.' })
  installedPowerKw?: number;

  @IsOptional() @IsString() @IsNotEmpty({ message: 'Informe a concessionária.' })
  distributor?: string;

  @IsOptional() @IsString() @IsNotEmpty({ message: 'Informe a unidade consumidora.' })
  consumerUnit?: string;

  @IsOptional() @IsString()
  address?: string;
}

export class PlantStatusDto {
  @IsIn(PLANT_OPERATIONAL_STATUSES, { message: 'Status inválido.' })
  status!: 'ACTIVE' | 'INACTIVE';
}

export class CreateInverterDto {
  @IsString() @IsNotEmpty({ message: 'Selecione a usina.' })
  plantId!: string;

  @IsString() @IsNotEmpty({ message: 'Selecione o fabricante.' })
  manufacturerId!: string;

  @IsString() @IsNotEmpty({ message: 'Informe o modelo.' })
  model!: string;

  @IsString() @IsNotEmpty({ message: 'Informe o número de série.' })
  serialNumber!: string;

  @Type(() => Number) @IsNumber({}, { message: 'Informe a potência nominal.' }) @Min(0, { message: 'A potência deve ser maior ou igual a zero.' })
  ratedPowerKw!: number;

  @IsOptional() @IsString()
  externalId?: string;

  @IsOptional() @IsIn(RECORD_STATUSES, { message: 'Status inválido.' })
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdateInverterDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'Selecione a usina.' })
  plantId?: string;

  @IsOptional() @IsString() @IsNotEmpty({ message: 'Selecione o fabricante.' })
  manufacturerId?: string;

  @IsOptional() @IsString() @IsNotEmpty({ message: 'Informe o modelo.' })
  model?: string;

  @IsOptional() @IsString() @IsNotEmpty({ message: 'Informe o número de série.' })
  serialNumber?: string;

  @IsOptional() @Type(() => Number) @IsNumber({}, { message: 'Informe a potência nominal.' }) @Min(0, { message: 'A potência deve ser maior ou igual a zero.' })
  ratedPowerKw?: number;

  @IsOptional() @IsString()
  externalId?: string;
}

export class CreateEquipmentDto {
  @IsString() @IsNotEmpty({ message: 'Selecione a usina.' })
  plantId!: string;

  @IsIn(EQUIPMENT_TYPES, { message: 'Tipo de equipamento inválido.' })
  type!: (typeof EQUIPMENT_TYPES)[number];

  @IsString() @MinLength(1, { message: 'Informe o número de série.' })
  serialNumber!: string;

  @IsOptional() @IsString()
  inverterId?: string;

  @IsOptional() @IsString()
  manufacturerName?: string;

  @IsOptional() @IsString()
  model?: string;

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional() @IsIn(RECORD_STATUSES, { message: 'Status inválido.' })
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdateEquipmentDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'Selecione a usina.' })
  plantId?: string;

  @IsOptional() @IsIn(EQUIPMENT_TYPES, { message: 'Tipo de equipamento inválido.' })
  type?: (typeof EQUIPMENT_TYPES)[number];

  @IsOptional() @IsString() @MinLength(1, { message: 'Informe o número de série.' })
  serialNumber?: string;

  @IsOptional() @IsString()
  inverterId?: string;

  @IsOptional() @IsString()
  manufacturerName?: string;

  @IsOptional() @IsString()
  model?: string;

  @IsOptional() @IsString()
  notes?: string;
}

export class CreateDistributorDto {
  @IsString() @IsNotEmpty({ message: 'Informe o nome da distribuidora.' })
  name!: string;

  @IsString() @IsNotEmpty({ message: 'Informe o código da distribuidora.' })
  code!: string;

  @IsOptional() @IsString()
  cnpj?: string;

  @IsOptional() @IsIn(RECORD_STATUSES, { message: 'Status inválido.' })
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdateDistributorDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'Informe o nome da distribuidora.' })
  name?: string;

  @IsOptional() @IsString() @IsNotEmpty({ message: 'Informe o código da distribuidora.' })
  code?: string;

  @IsOptional() @IsString()
  cnpj?: string;
}

export class CreateConsumerDto {
  @IsString() @IsNotEmpty({ message: 'Informe o nome do consumidor.' })
  name!: string;

  @IsString() @IsNotEmpty({ message: 'Informe o CPF/CNPJ.' })
  document!: string;

  @IsIn(DOCUMENT_TYPES, { message: 'Tipo de documento inválido.' })
  documentType!: (typeof DOCUMENT_TYPES)[number];

  @IsOptional() @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email?: string;

  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsIn(RECORD_STATUSES, { message: 'Status inválido.' })
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdateConsumerDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'Informe o nome do consumidor.' })
  name?: string;

  @IsOptional() @IsString() @IsNotEmpty({ message: 'Informe o CPF/CNPJ.' })
  document?: string;

  @IsOptional() @IsIn(DOCUMENT_TYPES, { message: 'Tipo de documento inválido.' })
  documentType?: (typeof DOCUMENT_TYPES)[number];

  @IsOptional() @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email?: string;

  @IsOptional() @IsString()
  phone?: string;
}

export class CreateConsumerUnitDto {
  @IsString() @IsNotEmpty({ message: 'Selecione o consumidor.' })
  consumerId!: string;

  @IsString() @IsNotEmpty({ message: 'Selecione a distribuidora.' })
  distributorId!: string;

  @IsString() @IsNotEmpty({ message: 'Informe o número da unidade consumidora.' })
  number!: string;

  @IsOptional() @IsString()
  address?: string;

  @IsOptional() @IsIn(RECORD_STATUSES, { message: 'Status inválido.' })
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdateConsumerUnitDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'Selecione o consumidor.' })
  consumerId?: string;

  @IsOptional() @IsString() @IsNotEmpty({ message: 'Selecione a distribuidora.' })
  distributorId?: string;

  @IsOptional() @IsString() @IsNotEmpty({ message: 'Informe o número da unidade consumidora.' })
  number?: string;

  @IsOptional() @IsString()
  address?: string;
}
