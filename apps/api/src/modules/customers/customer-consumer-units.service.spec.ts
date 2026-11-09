import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { CreateCustomerConsumerUnitDto } from '../common/dto';
import { ConsumerUnitsService } from '../consumer-units/consumer-units.service';
import { CustomerConsumerUnitsService } from './customer-consumer-units.service';

type CustomerRow = { id: string; consumerId: string | null; consumer: { id: string } | null };

describe('CustomerConsumerUnitsService', () => {
  let service: CustomerConsumerUnitsService;
  let consumerUnits: ConsumerUnitsService;
  let customers: Record<string, CustomerRow>;
  let consumers: Record<string, { id: string }>;
  let prisma: {
    customer: { findUnique: jest.Mock };
    consumer: { findUnique: jest.Mock };
    distributor: { findUnique: jest.Mock };
    consumerUnit: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let authorization: { resolveAccessScope: jest.Mock; canAccessCustomer: jest.Mock };

  const staffUser = { sub: 'staff', email: 's@b7.test', role: 'OPERADOR' };
  const customerUser = { sub: 'cust', email: 'c@b7.test', role: 'CUSTOMER' };
  const unrestrictedScope = {
    userId: 'staff', primaryRole: 'OPERADOR', unrestricted: true, customerIds: [], customerWideIds: [], plantIds: [],
  };
  const restrictedScope = (customerIds: string[]) => ({
    userId: 'cust', primaryRole: 'CUSTOMER', unrestricted: false, customerIds, customerWideIds: customerIds, plantIds: [],
  });
  const asCustomerA = () => authorization.resolveAccessScope.mockResolvedValue(restrictedScope(['cust-a']));
  const asNoScope = () => authorization.resolveAccessScope.mockResolvedValue(restrictedScope([]));
  const unitDto = { distributorId: 'd1', number: '11.230.436' };

  /** Mesma configuração do ValidationPipe global (main.ts). */
  const validateBody = (body: object) =>
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
      .transform(body, { type: 'body', metatype: CreateCustomerConsumerUnitDto });

  beforeEach(() => {
    customers = {
      'cust-a': { id: 'cust-a', consumerId: 'cons-a', consumer: { id: 'cons-a' } },
      'cust-b': { id: 'cust-b', consumerId: 'cons-b', consumer: { id: 'cons-b' } },
      'cust-empty': { id: 'cust-empty', consumerId: null, consumer: null },
    };
    consumers = { 'cons-a': { id: 'cons-a' }, 'cons-b': { id: 'cons-b' } };
    prisma = {
      customer: {
        findUnique: jest.fn(({ where }: { where: { id?: string; consumerId?: string } }) => {
          if (where.id) return Promise.resolve(customers[where.id] ?? null);
          const owner = Object.values(customers).find((row) => row.consumerId === where.consumerId);
          return Promise.resolve(owner ? { id: owner.id } : null);
        }),
      },
      consumer: { findUnique: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(consumers[where.id] ?? null)) },
      distributor: { findUnique: jest.fn().mockResolvedValue({ id: 'd1' }) },
      consumerUnit: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1', number: '11230436' }]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: { data: object }) => Promise.resolve({ id: 'new', ...data })),
        update: jest.fn(),
      },
    };
    authorization = {
      resolveAccessScope: jest.fn().mockResolvedValue(unrestrictedScope),
      canAccessCustomer: jest.fn(
        (scope: { unrestricted: boolean; customerIds: string[] }, customerId: string) =>
          scope.unrestricted || scope.customerIds.includes(customerId),
      ),
    };
    consumerUnits = new ConsumerUnitsService(prisma as never, authorization as never);
    service = new CustomerConsumerUnitsService(prisma as never, consumerUnits, authorization as never);
  });

  describe('comportamento existente (usuário interno irrestrito)', () => {
    it('lista vazia quando o cliente não tem Consumer', async () => {
      await expect(service.listByCustomer('cust-empty', staffUser)).resolves.toEqual([]);
      expect(prisma.consumerUnit.findMany).not.toHaveBeenCalled();
    });

    it('lista UCs do Consumer do cliente', async () => {
      await expect(service.listByCustomer('cust-a', staffUser)).resolves.toEqual([{ id: 'u1', number: '11230436' }]);
      expect(prisma.consumerUnit.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { consumerId: 'cons-a' } }));
    });

    it('não cria UC sem cadastro energético', async () => {
      await expect(service.createForCustomer('cust-empty', unitDto, staffUser)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.consumerUnit.create).not.toHaveBeenCalled();
    });

    it('falha com cliente inexistente', async () => {
      await expect(service.listByCustomer('x', staffUser)).rejects.toThrow('Cliente não encontrado.');
      await expect(service.createForCustomer('x', unitDto, staffUser)).rejects.toThrow('Cliente não encontrado.');
    });
  });

  describe('GET /customers/:id/consumer-units', () => {
    it('1. usuário interno irrestrito lista UCs do Customer', async () => {
      await expect(service.listByCustomer('cust-b', staffUser)).resolves.toHaveLength(1);
      expect(authorization.resolveAccessScope).toHaveBeenCalledWith(staffUser);
    });

    it('2. usuário restrito lista UCs do Customer autorizado', async () => {
      asCustomerA();
      await expect(service.listByCustomer('cust-a', customerUser)).resolves.toHaveLength(1);
      expect(authorization.canAccessCustomer).toHaveBeenCalledWith(expect.objectContaining({ unrestricted: false }), 'cust-a');
    });

    it('3. usuário restrito não lista UCs de Customer fora do escopo (404)', async () => {
      asCustomerA();
      await expect(service.listByCustomer('cust-b', customerUser)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.consumerUnit.findMany).not.toHaveBeenCalled();
    });

    it('4. usuário sem Customer scope não lista (404)', async () => {
      asNoScope();
      await expect(service.listByCustomer('cust-a', customerUser)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.consumerUnit.findMany).not.toHaveBeenCalled();
    });

    it('5. fora do escopo responde igual a Customer inexistente, sem consultar dados', async () => {
      asCustomerA();
      const outOfScope = await service.listByCustomer('cust-b', customerUser).catch((e: Error) => e);
      const missing = await service.listByCustomer('nope', customerUser).catch((e: Error) => e);
      expect(outOfScope).toBeInstanceOf(NotFoundException);
      expect((outOfScope as Error).message).toBe((missing as Error).message);
      expect(prisma.customer.findUnique).not.toHaveBeenCalled();
      expect(prisma.consumerUnit.findMany).not.toHaveBeenCalled();
    });

    it('6. consulta ao banco já restringida ao Consumer do Customer autorizado', async () => {
      asCustomerA();
      await service.listByCustomer('cust-a', customerUser);
      expect(prisma.consumerUnit.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.consumerUnit.findMany.mock.calls[0][0].where).toEqual({ consumerId: 'cons-a' });
    });
  });

  describe('POST /customers/:id/consumer-units', () => {
    it('7. usuário interno irrestrito cria UC', async () => {
      await expect(service.createForCustomer('cust-b', unitDto, staffUser)).resolves.toMatchObject({
        consumerId: 'cons-b',
        number: '11230436',
      });
    });

    it('8. usuário restrito cria UC com Customer autorizado e Consumer do mesmo Customer', async () => {
      asCustomerA();
      await expect(service.createForCustomer('cust-a', unitDto, customerUser)).resolves.toMatchObject({ consumerId: 'cons-a' });
      expect(authorization.canAccessCustomer.mock.calls.map((call: unknown[]) => call[1])).toEqual(['cust-a', 'cust-a']);
    });

    it('9. usuário restrito não cria UC para Customer fora do escopo (404)', async () => {
      asCustomerA();
      await expect(service.createForCustomer('cust-b', unitDto, customerUser)).rejects.toThrow('Cliente não encontrado.');
    });

    it('10. usuário sem Customer scope não cria (404)', async () => {
      asNoScope();
      await expect(service.createForCustomer('cust-a', unitDto, customerUser)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('11/12. Customer autorizado na URL + consumerId de outro Customer no body é rejeitado pela validação', async () => {
      await expect(validateBody({ ...unitDto, consumerId: 'cons-b' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('11/12. mesmo sem a validação HTTP, o serviço nunca usa consumerId externo ao Customer da URL', async () => {
      asCustomerA();
      const forged = { ...unitDto, consumerId: 'cons-b' } as CreateCustomerConsumerUnitDto;
      await service.createForCustomer('cust-a', forged, customerUser);
      expect(prisma.consumerUnit.create).toHaveBeenCalledTimes(1);
      expect(prisma.consumerUnit.create.mock.calls[0][0].data.consumerId).toBe('cons-a');
    });

    it('13. Customer fora do escopo na URL + Consumer autorizado falha (404)', async () => {
      asCustomerA();
      await expect(service.createForCustomer('cust-b', unitDto, customerUser)).rejects.toBeInstanceOf(NotFoundException);
      await expect(validateBody({ ...unitDto, consumerId: 'cons-a' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('14. tentativas negadas não criam registro', async () => {
      asCustomerA();
      await service.createForCustomer('cust-b', unitDto, customerUser).catch(() => undefined);
      asNoScope();
      await service.createForCustomer('cust-a', unitDto, customerUser).catch(() => undefined);
      expect(prisma.consumerUnit.create).not.toHaveBeenCalled();
    });

    it('15. Consumer inexistente mantém 404 "Consumidor não encontrado."', async () => {
      customers['cust-ghost'] = { id: 'cust-ghost', consumerId: 'cons-ghost', consumer: null };
      await expect(service.createForCustomer('cust-ghost', unitDto, staffUser)).rejects.toThrow('Consumidor não encontrado.');
      expect(prisma.consumerUnit.create).not.toHaveBeenCalled();
    });

    it('16. Consumer sem Customer titular falha fechado para usuário restrito', async () => {
      consumers['cons-orphan'] = { id: 'cons-orphan' };
      customers['cust-a'] = { id: 'cust-a', consumerId: 'cons-orphan', consumer: { id: 'cons-orphan' } };
      prisma.customer.findUnique.mockImplementation(({ where }: { where: { id?: string; consumerId?: string } }) =>
        Promise.resolve(where.id ? customers[where.id] ?? null : null),
      );
      asCustomerA();
      await expect(service.createForCustomer('cust-a', unitDto, customerUser)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.consumerUnit.create).not.toHaveBeenCalled();
    });

    it('17. Consumer sem Customer titular: usuário irrestrito mantém comportamento atual (cria)', async () => {
      consumers['cons-orphan'] = { id: 'cons-orphan' };
      customers['cust-a'] = { id: 'cust-a', consumerId: 'cons-orphan', consumer: { id: 'cons-orphan' } };
      prisma.customer.findUnique.mockImplementation(({ where }: { where: { id?: string; consumerId?: string } }) =>
        Promise.resolve(where.id ? customers[where.id] ?? null : null),
      );
      await expect(service.createForCustomer('cust-a', unitDto, staffUser)).resolves.toMatchObject({ consumerId: 'cons-orphan' });
    });

    it('criação autorizada continua respeitando as validações de ConsumerUnitsService', async () => {
      asCustomerA();
      prisma.distributor.findUnique.mockResolvedValue(null);
      await expect(service.createForCustomer('cust-a', unitDto, customerUser)).rejects.toThrow('Distribuidora não encontrada.');
      expect(prisma.consumerUnit.create).not.toHaveBeenCalled();
    });
  });

  describe('cross-tenant (Customer A autorizado, Customer B fora do escopo)', () => {
    it('POST /customers/A com consumerId = Consumer B → negado, sem criação', async () => {
      asCustomerA();
      await expect(validateBody({ ...unitDto, consumerId: 'cons-b' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.consumerUnit.create).not.toHaveBeenCalled();
    });

    it('POST /customers/B com consumerId = Consumer A → negado, sem criação', async () => {
      asCustomerA();
      await expect(validateBody({ ...unitDto, consumerId: 'cons-a' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.createForCustomer('cust-b', unitDto, customerUser)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.consumerUnit.create).not.toHaveBeenCalled();
    });
  });

  it('bypass: POST /consumer-units e POST /customers/:id/consumer-units negam Consumer B', async () => {
    asCustomerA();
    const direct = await consumerUnits
      .createForUser({ consumerId: 'cons-b', distributorId: 'd1', number: '1' }, customerUser)
      .catch((e: Error) => e);
    const viaCustomerB = await service.createForCustomer('cust-b', unitDto, customerUser).catch((e: Error) => e);
    const viaCustomerAForgedBody = await validateBody({ ...unitDto, consumerId: 'cons-b' }).catch((e: Error) => e);
    expect(direct).toBeInstanceOf(NotFoundException);
    expect(viaCustomerB).toBeInstanceOf(NotFoundException);
    expect(viaCustomerAForgedBody).toBeInstanceOf(BadRequestException);
    expect(prisma.consumerUnit.create).not.toHaveBeenCalled();
    for (const call of [...prisma.customer.findUnique.mock.calls, ...prisma.consumerUnit.findMany.mock.calls]) {
      expect(JSON.stringify(call[0])).not.toMatch(/plant|rateio/i);
    }
  });
});
