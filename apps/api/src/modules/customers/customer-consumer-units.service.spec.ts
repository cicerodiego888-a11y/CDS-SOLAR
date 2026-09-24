import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustomerConsumerUnitsService } from './customer-consumer-units.service';

describe('CustomerConsumerUnitsService', () => {
  let service: CustomerConsumerUnitsService;
  let prisma: {
    customer: { findUnique: jest.Mock };
    consumerUnit: { findMany: jest.Mock };
  };
  let consumerUnits: { create: jest.Mock };

  beforeEach(() => {
    prisma = {
      customer: { findUnique: jest.fn() },
      consumerUnit: { findMany: jest.fn() },
    };
    consumerUnits = { create: jest.fn() };
    service = new CustomerConsumerUnitsService(prisma as never, consumerUnits as never);
  });

  it('lista vazia quando o cliente não tem Consumer', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust1', consumerId: null, consumer: null });
    prisma.consumerUnit.findMany.mockResolvedValue([]);
    await expect(service.listByCustomer('cust1')).resolves.toEqual([]);
    expect(prisma.consumerUnit.findMany).not.toHaveBeenCalled();
  });

  it('lista UCs do Consumer do cliente', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust1', consumerId: 'cons1', consumer: { id: 'cons1' } });
    prisma.consumerUnit.findMany.mockResolvedValue([{ id: 'u1', number: '11230436' }]);
    await expect(service.listByCustomer('cust1')).resolves.toEqual([{ id: 'u1', number: '11230436' }]);
    expect(prisma.consumerUnit.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { consumerId: 'cons1' },
    }));
  });

  it('cria UC vinculada ao Consumer do cliente', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust1', consumerId: 'cons1', consumer: { id: 'cons1' } });
    consumerUnits.create.mockResolvedValue({ id: 'u1', number: '11230436', contractAccount: null });
    await expect(service.createForCustomer('cust1', {
      distributorId: 'd1',
      number: '11230436',
    })).resolves.toMatchObject({ id: 'u1' });
    expect(consumerUnits.create).toHaveBeenCalledWith({
      consumerId: 'cons1',
      distributorId: 'd1',
      number: '11230436',
      contractAccount: undefined,
      address: undefined,
      status: undefined,
    });
  });

  it('não cria UC sem cadastro energético', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust1', consumerId: null, consumer: null });
    await expect(service.createForCustomer('cust1', { distributorId: 'd1', number: '1' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('falha com cliente inexistente', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.listByCustomer('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
