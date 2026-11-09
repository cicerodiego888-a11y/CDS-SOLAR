import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { hasPermission } from '../auth/permissions.catalog';
import { ConsumerUnitsService } from './consumer-units.service';

describe('ConsumerUnitsService', () => {
  let service: ConsumerUnitsService;
  let prisma: {
    consumerUnit: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    consumer: { findUnique: jest.Mock };
    distributor: { findUnique: jest.Mock };
    customer: { findUnique: jest.Mock };
  };
  let authorization: { resolveAccessScope: jest.Mock; canAccessCustomer: jest.Mock };
  const staffUser = { sub: 'staff', email: 's@b7.test', role: 'OPERADOR' };
  const customerUser = { sub: 'cust', email: 'c@b7.test', role: 'CUSTOMER' };
  const restrictedScope = (customerIds: string[]) => ({
    userId: 'cust',
    primaryRole: 'CUSTOMER',
    unrestricted: false,
    customerIds,
    customerWideIds: customerIds,
    plantIds: [],
  });

  beforeEach(() => {
    prisma = {
      consumerUnit: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      consumer: { findUnique: jest.fn() },
      distributor: { findUnique: jest.fn() },
      customer: { findUnique: jest.fn() },
    };
    authorization = {
      resolveAccessScope: jest.fn().mockResolvedValue({
        userId: 'staff',
        primaryRole: 'OPERADOR',
        unrestricted: true,
        customerIds: [],
        customerWideIds: [],
        plantIds: [],
      }),
      canAccessCustomer: jest.fn(
        (scope: { unrestricted: boolean; customerIds: string[] }, customerId: string) =>
          scope.unrestricted || scope.customerIds.includes(customerId),
      ),
    };
    service = new ConsumerUnitsService(prisma as never, authorization as never);
  });

  it('1. Consumer sem UC retorna lista vazia', async () => {
    prisma.consumerUnit.findMany.mockResolvedValue([]);
    await expect(service.findAll({ consumerId: 'c1' }, staffUser)).resolves.toEqual([]);
  });

  describe('escopo de acesso da listagem', () => {
    it('usuário irrestrito (staff) lista sem filtro de escopo', async () => {
      prisma.consumerUnit.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
      await expect(service.findAll(undefined, staffUser)).resolves.toHaveLength(2);
      expect(authorization.resolveAccessScope).toHaveBeenCalledWith(staffUser);
      const where = prisma.consumerUnit.findMany.mock.calls[0][0].where;
      expect(where.consumer).toBeUndefined();
    });

    it('usuário restrito lista somente UCs de titulares vinculados aos seus clientes', async () => {
      authorization.resolveAccessScope.mockResolvedValue(restrictedScope(['cust-a', 'cust-b']));
      prisma.consumerUnit.findMany.mockResolvedValue([{ id: 'u1' }]);
      await service.findAll(undefined, customerUser);
      const where = prisma.consumerUnit.findMany.mock.calls[0][0].where;
      expect(where.consumer).toEqual({ customer: { id: { in: ['cust-a', 'cust-b'] } } });
    });

    it('usuário restrito mantém os filtros da query combinados com o escopo', async () => {
      authorization.resolveAccessScope.mockResolvedValue(restrictedScope(['cust-a']));
      prisma.consumerUnit.findMany.mockResolvedValue([]);
      await service.findAll({ consumerId: 'c9', distributorId: 'd1', status: 'ACTIVE' }, customerUser);
      const where = prisma.consumerUnit.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        consumerId: 'c9',
        distributorId: 'd1',
        status: 'ACTIVE',
        consumer: { customer: { id: { in: ['cust-a'] } } },
      });
    });

    it('usuário restrito sem escopo recebe lista vazia sem consultar o banco', async () => {
      authorization.resolveAccessScope.mockResolvedValue(restrictedScope([]));
      await expect(service.findAll(undefined, customerUser)).resolves.toEqual([]);
      expect(prisma.consumerUnit.findMany).not.toHaveBeenCalled();
    });

    it('escopo não usa vínculo Plant.consumerUnitId nem participação em rateio', async () => {
      authorization.resolveAccessScope.mockResolvedValue({ ...restrictedScope(['cust-a']), plantIds: ['plant-x'] });
      prisma.consumerUnit.findMany.mockResolvedValue([]);
      await service.findAll(undefined, customerUser);
      const serialized = JSON.stringify(prisma.consumerUnit.findMany.mock.calls[0][0].where);
      expect(serialized).not.toMatch(/plants|plant-x|rateio/i);
    });
  });

  it('2. cria UC normalizando o número', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.distributor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.consumerUnit.findUnique.mockResolvedValue(null);
    prisma.consumerUnit.create.mockResolvedValue({ id: 'u1', number: '11230436', consumerId: 'c1', distributorId: 'd1' });
    const created = await service.create({
      consumerId: 'c1',
      distributorId: 'd1',
      number: '11.230.436',
      contractAccount: '003.005.596.601',
    });
    expect(created.id).toBe('u1');
    expect(prisma.consumerUnit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        number: '11230436',
        contractAccount: '003005596601',
        consumerId: 'c1',
        distributorId: 'd1',
      }),
      include: expect.any(Object),
    });
    expect(prisma.consumerUnit.create.mock.calls[0][0].data.plantId).toBeUndefined();
  });

  it('3. lista UCs', async () => {
    prisma.consumerUnit.findMany.mockResolvedValue([{ id: 'u1' }]);
    await expect(service.findAll({ consumerId: 'c1' }, staffUser)).resolves.toEqual([{ id: 'u1' }]);
  });

  it('4. edita UC', async () => {
    prisma.consumerUnit.findUnique
      .mockResolvedValueOnce({ id: 'u1', consumerId: 'c1', distributorId: 'd1', number: '123' })
      .mockResolvedValueOnce(null);
    prisma.consumerUnit.update.mockResolvedValue({ id: 'u1', address: 'Rua A', contractAccount: '99' });
    await expect(service.update('u1', { address: 'Rua A', contractAccount: '99' }, staffUser))
      .resolves.toMatchObject({ address: 'Rua A' });
  });

  it('10. Conta Contrato é separada da UC', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.distributor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.consumerUnit.findUnique.mockResolvedValue(null);
    prisma.consumerUnit.create.mockResolvedValue({ id: 'u1' });
    await service.create({
      consumerId: 'c1',
      distributorId: 'd1',
      number: '11230436',
      contractAccount: '003005596601',
    });
    const data = prisma.consumerUnit.create.mock.calls[0][0].data;
    expect(data.number).toBe('11230436');
    expect(data.contractAccount).toBe('003005596601');
    expect(data.number).not.toBe(data.contractAccount);
  });

  it('11. permite UC sem Conta Contrato', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.distributor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.consumerUnit.findUnique.mockResolvedValue(null);
    prisma.consumerUnit.create.mockResolvedValue({ id: 'u1' });
    await service.create({ consumerId: 'c1', distributorId: 'd1', number: '11230436' });
    expect(prisma.consumerUnit.create.mock.calls[0][0].data.contractAccount).toBeUndefined();
  });

  it('16. não cria UC duplicada na mesma distribuidora', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.distributor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.consumerUnit.findUnique.mockResolvedValue({ id: 'other', distributorId: 'd1', number: '123' });
    await expect(service.create({ consumerId: 'c1', distributorId: 'd1', number: '123' }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('17. permite múltiplas UCs para o mesmo Consumer', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.distributor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.consumerUnit.findUnique.mockResolvedValue(null);
    prisma.consumerUnit.create
      .mockResolvedValueOnce({ id: 'u1', consumerId: 'c1', number: '1' })
      .mockResolvedValueOnce({ id: 'u2', consumerId: 'c1', number: '2' });
    await service.create({ consumerId: 'c1', distributorId: 'd1', number: '1' });
    await service.create({ consumerId: 'c1', distributorId: 'd1', number: '2' });
    expect(prisma.consumerUnit.create).toHaveBeenCalledTimes(2);
  });

  it('19. validação rejeita número vazio', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.distributor.findUnique.mockResolvedValue({ id: 'd1' });
    await expect(service.create({ consumerId: 'c1', distributorId: 'd1', number: '   ' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('8. exige Distributor existente', async () => {
    prisma.consumer.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.distributor.findUnique.mockResolvedValue(null);
    await expect(service.create({ consumerId: 'c1', distributorId: 'x', number: '1' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejeita Consumer inexistente', async () => {
    prisma.consumer.findUnique.mockResolvedValue(null);
    await expect(service.create({ consumerId: 'x', distributorId: 'd1', number: '1' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('ativa/desativa', async () => {
    prisma.consumerUnit.findUnique.mockResolvedValue({ id: 'u1' });
    prisma.consumerUnit.update.mockResolvedValue({ id: 'u1', status: 'INACTIVE' });
    await expect(service.updateStatus('u1', { status: 'INACTIVE' }, staffUser)).resolves.toMatchObject({ status: 'INACTIVE' });
  });

  it('busca por ID', async () => {
    prisma.consumerUnit.findUnique.mockResolvedValue({ id: 'u1' });
    await expect(service.findOne('u1', staffUser)).resolves.toMatchObject({ id: 'u1' });
  });

  it('falha ao buscar inexistente', async () => {
    prisma.consumerUnit.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x', staffUser)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('escopo das operações individuais', () => {
    const ownUnit = { id: 'u-own', consumerId: 'cons-a', distributorId: 'd1', number: '100' };
    const otherUnit = { id: 'u-other', consumerId: 'cons-b', distributorId: 'd1', number: '200' };
    const customerOfConsumer: Record<string, { id: string }> = {
      'cons-a': { id: 'cust-a' },
      'cons-b': { id: 'cust-b' },
    };

    beforeEach(() => {
      prisma.consumerUnit.findUnique.mockImplementation(({ where }: { where: { id?: string } }) => {
        if (where.id === ownUnit.id) return Promise.resolve(ownUnit);
        if (where.id === otherUnit.id) return Promise.resolve(otherUnit);
        return Promise.resolve(null);
      });
      prisma.customer.findUnique.mockImplementation(({ where }: { where: { consumerId: string } }) =>
        Promise.resolve(customerOfConsumer[where.consumerId] ?? null),
      );
      prisma.consumerUnit.update.mockImplementation(({ where, data }: { where: { id: string }; data: object }) =>
        Promise.resolve({ id: where.id, ...data }),
      );
    });

    const asCustomerA = () => authorization.resolveAccessScope.mockResolvedValue(restrictedScope(['cust-a']));
    const asNoScope = () => authorization.resolveAccessScope.mockResolvedValue(restrictedScope([]));

    describe('GET /consumer-units/:id', () => {
      it('1. usuário interno irrestrito consulta qualquer UC', async () => {
        await expect(service.findOne(otherUnit.id, staffUser)).resolves.toMatchObject({ id: otherUnit.id });
        expect(prisma.customer.findUnique).not.toHaveBeenCalled();
      });

      it('2. usuário restrito consulta UC do seu Customer', async () => {
        asCustomerA();
        await expect(service.findOne(ownUnit.id, customerUser)).resolves.toMatchObject({ id: ownUnit.id });
        expect(authorization.canAccessCustomer).toHaveBeenCalledWith(expect.objectContaining({ unrestricted: false }), 'cust-a');
      });

      it('3. usuário restrito não consulta UC de outro Customer (404)', async () => {
        asCustomerA();
        await expect(service.findOne(otherUnit.id, customerUser)).rejects.toBeInstanceOf(NotFoundException);
      });

      it('4. usuário sem Customer scope não consulta UC (404)', async () => {
        asNoScope();
        await expect(service.findOne(ownUnit.id, customerUser)).rejects.toBeInstanceOf(NotFoundException);
      });

      it('5. UC inexistente mantém 404 com a mesma mensagem da UC fora do escopo', async () => {
        asCustomerA();
        const missing = await service.findOne('nope', customerUser).catch((e: Error) => e);
        const outOfScope = await service.findOne(otherUnit.id, customerUser).catch((e: Error) => e);
        expect(missing).toBeInstanceOf(NotFoundException);
        expect(outOfScope).toBeInstanceOf(NotFoundException);
        expect((outOfScope as Error).message).toBe((missing as Error).message);
      });

      it('titular sem Customer vinculado fica fora do escopo restrito (404)', async () => {
        asCustomerA();
        prisma.customer.findUnique.mockResolvedValue(null);
        await expect(service.findOne(ownUnit.id, customerUser)).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    describe('PATCH /consumer-units/:id', () => {
      it('6. usuário interno irrestrito altera UC', async () => {
        await expect(service.update(otherUnit.id, { address: 'Rua X' }, staffUser)).resolves.toMatchObject({ address: 'Rua X' });
      });

      it('7. usuário restrito altera UC do seu Customer', async () => {
        asCustomerA();
        await expect(service.update(ownUnit.id, { address: 'Rua Y' }, customerUser)).resolves.toMatchObject({ address: 'Rua Y' });
      });

      it('8. usuário restrito não altera UC de outro Customer (404)', async () => {
        asCustomerA();
        await expect(service.update(otherUnit.id, { address: 'Rua Z' }, customerUser)).rejects.toBeInstanceOf(NotFoundException);
      });

      it('9. usuário sem escopo não altera UC (404)', async () => {
        asNoScope();
        await expect(service.update(ownUnit.id, { address: 'Rua Z' }, customerUser)).rejects.toBeInstanceOf(NotFoundException);
      });

      it('10. tentativa fora do escopo não modifica o banco', async () => {
        asCustomerA();
        await service.update(otherUnit.id, { address: 'Rua Z', number: '999' }, customerUser).catch(() => undefined);
        asNoScope();
        await service.update(ownUnit.id, { address: 'Rua Z' }, customerUser).catch(() => undefined);
        expect(prisma.consumerUnit.update).not.toHaveBeenCalled();
      });

      it('não permite mover UC autorizada para titular fora do escopo', async () => {
        asCustomerA();
        prisma.consumer.findUnique.mockResolvedValue({ id: 'cons-b' });
        await expect(service.update(ownUnit.id, { consumerId: 'cons-b' }, customerUser)).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.consumerUnit.update).not.toHaveBeenCalled();
      });
    });

    describe('PATCH /consumer-units/:id/status', () => {
      it('11. usuário interno irrestrito altera status', async () => {
        await expect(service.updateStatus(otherUnit.id, { status: 'INACTIVE' }, staffUser)).resolves.toMatchObject({ status: 'INACTIVE' });
      });

      it('12. usuário restrito altera status de UC autorizada', async () => {
        asCustomerA();
        await expect(service.updateStatus(ownUnit.id, { status: 'INACTIVE' }, customerUser)).resolves.toMatchObject({ status: 'INACTIVE' });
      });

      it('13. usuário restrito não altera status de UC fora do escopo (404)', async () => {
        asCustomerA();
        await expect(service.updateStatus(otherUnit.id, { status: 'INACTIVE' }, customerUser)).rejects.toBeInstanceOf(NotFoundException);
      });

      it('14. usuário sem escopo não altera status (404)', async () => {
        asNoScope();
        await expect(service.updateStatus(ownUnit.id, { status: 'INACTIVE' }, customerUser)).rejects.toBeInstanceOf(NotFoundException);
      });

      it('15. tentativa fora do escopo não modifica o banco', async () => {
        asCustomerA();
        await service.updateStatus(otherUnit.id, { status: 'INACTIVE' }, customerUser).catch(() => undefined);
        asNoScope();
        await service.updateStatus(ownUnit.id, { status: 'INACTIVE' }, customerUser).catch(() => undefined);
        expect(prisma.consumerUnit.update).not.toHaveBeenCalled();
      });
    });

    it('segurança: GET, PATCH e PATCH status aplicam a mesma regra, sem bypass entre si', async () => {
      asCustomerA();
      const results = await Promise.all([
        service.findOne(otherUnit.id, customerUser).catch((e: Error) => e),
        service.update(otherUnit.id, { address: 'x' }, customerUser).catch((e: Error) => e),
        service.updateStatus(otherUnit.id, { status: 'INACTIVE' }, customerUser).catch((e: Error) => e),
      ]);
      for (const result of results) expect(result).toBeInstanceOf(NotFoundException);
      expect(authorization.resolveAccessScope).toHaveBeenCalledTimes(3);
      expect(authorization.canAccessCustomer).toHaveBeenCalledTimes(3);
      expect(prisma.consumerUnit.update).not.toHaveBeenCalled();
      for (const call of prisma.consumerUnit.findUnique.mock.calls) {
        expect(JSON.stringify(call[0])).not.toMatch(/plants|rateio/i);
      }
    });
  });

  describe('POST /consumer-units — escopo da criação', () => {
    const consumers: Record<string, { id: string }> = {
      'cons-a': { id: 'cons-a' },
      'cons-b': { id: 'cons-b' },
      'cons-orphan': { id: 'cons-orphan' },
    };
    const customerOfConsumer: Record<string, { id: string }> = {
      'cons-a': { id: 'cust-a' },
      'cons-b': { id: 'cust-b' },
    };
    const dtoFor = (consumerId: string) => ({ consumerId, distributorId: 'd1', number: '11.230.436' });

    beforeEach(() => {
      prisma.consumer.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(consumers[where.id] ?? null),
      );
      prisma.customer.findUnique.mockImplementation(({ where }: { where: { consumerId: string } }) =>
        Promise.resolve(customerOfConsumer[where.consumerId] ?? null),
      );
      prisma.distributor.findUnique.mockResolvedValue({ id: 'd1' });
      prisma.consumerUnit.findUnique.mockResolvedValue(null);
      prisma.consumerUnit.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'new', ...data }));
    });

    const asCustomerA = () => authorization.resolveAccessScope.mockResolvedValue(restrictedScope(['cust-a']));
    const asNoScope = () => authorization.resolveAccessScope.mockResolvedValue(restrictedScope([]));

    it('1. usuário interno irrestrito cria UC sem consulta adicional de Customer', async () => {
      await expect(service.createForUser(dtoFor('cons-b'), staffUser)).resolves.toMatchObject({ consumerId: 'cons-b' });
      expect(prisma.customer.findUnique).not.toHaveBeenCalled();
      expect(prisma.consumerUnit.create).toHaveBeenCalledTimes(1);
    });

    it('2. usuário restrito cria UC para Consumer cujo Customer está no escopo', async () => {
      asCustomerA();
      await expect(service.createForUser(dtoFor('cons-a'), customerUser)).resolves.toMatchObject({
        consumerId: 'cons-a',
        number: '11230436',
      });
      expect(authorization.canAccessCustomer).toHaveBeenCalledWith(expect.objectContaining({ unrestricted: false }), 'cust-a');
    });

    it('3. usuário restrito não cria UC para Customer fora do escopo (404)', async () => {
      asCustomerA();
      await expect(service.createForUser(dtoFor('cons-b'), customerUser)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('4. usuário sem Customer scope não cria UC (404)', async () => {
      asNoScope();
      await expect(service.createForUser(dtoFor('cons-a'), customerUser)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('5. tentativa fora do escopo não cria registro no banco', async () => {
      asCustomerA();
      await service.createForUser(dtoFor('cons-b'), customerUser).catch(() => undefined);
      asNoScope();
      await service.createForUser(dtoFor('cons-a'), customerUser).catch(() => undefined);
      expect(prisma.consumerUnit.create).not.toHaveBeenCalled();
    });

    it('6. Consumer inexistente mantém 404 "Consumidor não encontrado." (irrestrito e restrito)', async () => {
      await expect(service.createForUser(dtoFor('nope'), staffUser)).rejects.toThrow('Consumidor não encontrado.');
      asCustomerA();
      await expect(service.createForUser(dtoFor('nope'), customerUser)).rejects.toThrow('Consumidor não encontrado.');
      const outOfScope = await service.createForUser(dtoFor('cons-b'), customerUser).catch((e: Error) => e);
      expect((outOfScope as Error).message).toBe('Consumidor não encontrado.');
      expect(prisma.consumerUnit.create).not.toHaveBeenCalled();
    });

    it('7a. Consumer sem Customer: usuário restrito → fail-closed (404, sem criação)', async () => {
      asCustomerA();
      await expect(service.createForUser(dtoFor('cons-orphan'), customerUser)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.consumerUnit.create).not.toHaveBeenCalled();
    });

    it('7b. Consumer sem Customer: usuário irrestrito → comportamento atual (cria)', async () => {
      await expect(service.createForUser(dtoFor('cons-orphan'), staffUser)).resolves.toMatchObject({ consumerId: 'cons-orphan' });
    });

    it('8. criação autorizada continua respeitando as validações existentes', async () => {
      asCustomerA();
      await expect(service.createForUser({ ...dtoFor('cons-a'), number: '   ' }, customerUser))
        .rejects.toBeInstanceOf(BadRequestException);
      prisma.distributor.findUnique.mockResolvedValue(null);
      await expect(service.createForUser(dtoFor('cons-a'), customerUser)).rejects.toThrow('Distribuidora não encontrada.');
      prisma.distributor.findUnique.mockResolvedValue({ id: 'd1' });
      prisma.consumerUnit.findUnique.mockResolvedValue({ id: 'dup', distributorId: 'd1', number: '11230436' });
      await expect(service.createForUser(dtoFor('cons-a'), customerUser)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.consumerUnit.create).not.toHaveBeenCalled();
    });

    it('9/10. autorização da criação não usa Plant.consumerUnitId nem Rateio', async () => {
      authorization.resolveAccessScope.mockResolvedValue({ ...restrictedScope(['cust-a']), plantIds: ['plant-x'] });
      await service.createForUser(dtoFor('cons-b'), customerUser).catch(() => undefined);
      await service.createForUser(dtoFor('cons-a'), customerUser);
      const queries = [
        ...prisma.customer.findUnique.mock.calls,
        ...prisma.consumer.findUnique.mock.calls,
        ...prisma.consumerUnit.findUnique.mock.calls,
        ...prisma.consumerUnit.create.mock.calls,
      ].map((call) => JSON.stringify(call[0]));
      for (const query of queries) expect(query).not.toMatch(/plant|rateio/i);
      expect(prisma.consumerUnit.create.mock.calls[0][0].data.plantId).toBeUndefined();
    });

    it('bypass: POST aplica a mesma regra de Customer scope de GET/PATCH/PATCH status', async () => {
      asCustomerA();
      const otherUnit = { id: 'u-other', consumerId: 'cons-b', distributorId: 'd1', number: '200' };
      prisma.consumerUnit.findUnique.mockImplementation(({ where }: { where: { id?: string } }) =>
        Promise.resolve(where.id === otherUnit.id ? otherUnit : null),
      );
      const results = await Promise.all([
        service.createForUser(dtoFor('cons-b'), customerUser).catch((e: Error) => e),
        service.findOne(otherUnit.id, customerUser).catch((e: Error) => e),
        service.update(otherUnit.id, { address: 'x' }, customerUser).catch((e: Error) => e),
        service.updateStatus(otherUnit.id, { status: 'INACTIVE' }, customerUser).catch((e: Error) => e),
      ]);
      for (const result of results) expect(result).toBeInstanceOf(NotFoundException);
      expect(authorization.resolveAccessScope).toHaveBeenCalledTimes(4);
      expect(authorization.canAccessCustomer.mock.calls.map((call: unknown[]) => call[1])).toEqual(['cust-b', 'cust-b', 'cust-b', 'cust-b']);
      expect(prisma.consumerUnit.create).not.toHaveBeenCalled();
      expect(prisma.consumerUnit.update).not.toHaveBeenCalled();
    });
  });

  it('20. autorização: OPERADOR vê, CONSUMIDOR portal não atualiza UC', () => {
    expect(hasPermission('OPERADOR', 'CONSUMER_UNITS_VIEW')).toBe(true);
    expect(hasPermission('ADMINISTRADOR', 'CONSUMER_UNITS_UPDATE')).toBe(true);
    expect(hasPermission('CONSUMIDOR', 'CONSUMER_UNITS_UPDATE')).toBe(false);
    expect(() => {
      if (!hasPermission('CONSUMIDOR', 'CONSUMER_UNITS_UPDATE')) throw new ForbiddenException('Acesso negado');
    }).toThrow(ForbiddenException);
  });
});
