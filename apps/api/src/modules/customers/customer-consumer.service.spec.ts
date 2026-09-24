import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { hasPermission } from '../auth/permissions.catalog';
import { DOCUMENT_IN_USE_MESSAGE } from '../common/energy-document';
import { CustomerConsumerService } from './customer-consumer.service';

const VALID_CPF = '52998224725';
const VALID_CNPJ = '11222333000181';
const OTHER_CPF = '39053344705';

describe('CustomerConsumerService', () => {
  let service: CustomerConsumerService;
  let prisma: {
    customer: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    consumer: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      customer: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      consumer: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
    service = new CustomerConsumerService(prisma as never);
  });

  function customerWithoutConsumer(id = 'cust1') {
    prisma.customer.findUnique.mockImplementation(async ({ where }: { where: { id?: string } }) => ({
      id: where.id ?? id,
      name: 'Cliente Antigo',
      email: 'cliente@b7.test',
      document: '00000000000100',
      consumerId: null,
      consumer: null,
    }));
  }

  it('1. cliente sem consumidor retorna vazio', async () => {
    customerWithoutConsumer('legacy');
    await expect(service.findByCustomer('legacy')).resolves.toBeNull();
    expect(prisma.consumer.create).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('2. cria consumidor normalizado e vinculado', async () => {
    customerWithoutConsumer();
    prisma.consumer.findUnique.mockResolvedValue(null);
    prisma.consumer.create.mockImplementation(async ({ data }: { data: { document: string } }) => ({ id: 'cons1', ...data }));
    prisma.customer.update.mockResolvedValue({ id: 'cust1', consumerId: 'cons1' });

    const created = await service.createForCustomer('cust1', {
      name: ' Titular ',
      document: '529.982.247-25',
      documentType: 'CPF',
      email: '',
      phone: ' (88) 99999-0000 ',
    });

    expect(created).toMatchObject({ id: 'cons1', document: VALID_CPF, documentType: 'CPF', name: 'Titular' });
    expect(prisma.consumer.create).toHaveBeenCalledWith({
      data: {
        name: 'Titular',
        document: VALID_CPF,
        documentType: 'CPF',
        email: null,
        phone: '(88) 99999-0000',
        status: 'ACTIVE',
      },
    });
    expect(prisma.consumer.create.mock.calls[0][0].data.customerId).toBeUndefined();
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'cust1' },
      data: { consumerId: 'cons1' },
    });
  });

  it('3. busca o consumidor do cliente', async () => {
    const consumer = { id: 'cons1', name: 'Titular', document: VALID_CPF, documentType: 'CPF' };
    prisma.customer.findUnique.mockResolvedValue({
      id: 'cust1',
      consumerId: 'cons1',
      consumer,
    });
    await expect(service.findByCustomer('cust1')).resolves.toEqual(consumer);
  });

  it('4. edita o consumidor sem alterar o cliente', async () => {
    prisma.customer.findUnique.mockResolvedValue({
      id: 'cust1',
      name: 'Cliente Antigo',
      email: 'cliente@b7.test',
      consumerId: 'cons1',
      consumer: {
        id: 'cons1',
        name: 'Titular',
        document: VALID_CPF,
        documentType: 'CPF',
        email: 'titular@b7.test',
        phone: null,
      },
    });
    prisma.consumer.update.mockResolvedValue({ id: 'cons1', name: 'Titular Novo', phone: '88988887777' });

    const updated = await service.updateForCustomer('cust1', { name: 'Titular Novo', phone: '88988887777' });

    expect(updated).toMatchObject({ name: 'Titular Novo' });
    expect(prisma.customer.update).not.toHaveBeenCalled();
    expect(prisma.consumer.update).toHaveBeenCalledWith({
      where: { id: 'cons1' },
      data: { name: 'Titular Novo', phone: '88988887777' },
    });
  });

  it('5. aceita CPF válido', async () => {
    customerWithoutConsumer();
    prisma.consumer.findUnique.mockResolvedValue(null);
    prisma.consumer.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 'cons1', ...data }));
    prisma.customer.update.mockResolvedValue({ id: 'cust1', consumerId: 'cons1' });

    await expect(service.createForCustomer('cust1', {
      name: 'Titular',
      document: VALID_CPF,
      documentType: 'CPF',
    })).resolves.toMatchObject({ document: VALID_CPF, documentType: 'CPF' });
  });

  it('6. aceita CNPJ válido', async () => {
    customerWithoutConsumer();
    prisma.consumer.findUnique.mockResolvedValue(null);
    prisma.consumer.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 'cons2', ...data }));
    prisma.customer.update.mockResolvedValue({ id: 'cust1', consumerId: 'cons2' });

    await expect(service.createForCustomer('cust1', {
      name: 'Empresa',
      document: '11.222.333/0001-81',
      documentType: 'CNPJ',
    })).resolves.toMatchObject({ document: VALID_CNPJ, documentType: 'CNPJ' });
  });

  it('7. rejeita CPF inválido', async () => {
    customerWithoutConsumer();
    await expect(service.createForCustomer('cust1', {
      name: 'Titular',
      document: '111.111.111-11',
      documentType: 'CPF',
    })).rejects.toThrow('CPF inválido.');
    await expect(service.createForCustomer('cust1', {
      name: 'Titular',
      document: '111.111.111-11',
      documentType: 'CPF',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.consumer.create).not.toHaveBeenCalled();
  });

  it('8. rejeita CNPJ inválido', async () => {
    customerWithoutConsumer();
    await expect(service.createForCustomer('cust1', {
      name: 'Empresa',
      document: '11.222.333/0001-80',
      documentType: 'CNPJ',
    })).rejects.toThrow('CNPJ inválido.');
    expect(prisma.consumer.create).not.toHaveBeenCalled();
  });

  it('9. rejeita documento já utilizado', async () => {
    customerWithoutConsumer('cust2');
    prisma.consumer.findUnique.mockResolvedValue({ id: 'cons1', document: VALID_CPF });
    await expect(service.createForCustomer('cust2', {
      name: 'Outro',
      document: '529.982.247-25',
      documentType: 'CPF',
    })).rejects.toThrow(DOCUMENT_IN_USE_MESSAGE);
    await expect(service.createForCustomer('cust2', {
      name: 'Outro',
      document: '529.982.247-25',
      documentType: 'CPF',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.consumer.create).not.toHaveBeenCalled();
  });

  it('10. cliente existente sem consumidor continua sem cadastro energético', async () => {
    customerWithoutConsumer('legacy');
    await expect(service.findByCustomer('legacy')).resolves.toBeNull();
    expect(prisma.consumer.create).not.toHaveBeenCalled();
    expect(prisma.consumer.update).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('11. não cria consumidor duplicado para o mesmo documento', async () => {
    customerWithoutConsumer();
    prisma.consumer.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'cons1', document: VALID_CPF });
    prisma.consumer.create.mockResolvedValue({ id: 'cons1', document: VALID_CPF, documentType: 'CPF', name: 'Titular' });
    prisma.customer.update.mockResolvedValue({ id: 'cust1', consumerId: 'cons1' });

    await service.createForCustomer('cust1', { name: 'Titular', document: VALID_CPF, documentType: 'CPF' });
    await expect(service.createForCustomer('cust2', {
      name: 'Outro nome',
      document: VALID_CPF,
      documentType: 'CPF',
    })).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.consumer.create).toHaveBeenCalledTimes(1);
    const lookup = prisma.consumer.findUnique.mock.calls.map((call) => call[0].where);
    expect(lookup).toEqual([{ document: VALID_CPF }, { document: VALID_CPF }]);
    expect(lookup.every((where: { name?: string }) => where.name === undefined)).toBe(true);
  });

  it('12. persiste a relação Customer ↔ Consumer pelo consumerId', async () => {
    customerWithoutConsumer();
    prisma.consumer.findUnique.mockResolvedValue(null);
    prisma.consumer.create.mockResolvedValue({ id: 'cons1', document: VALID_CPF, documentType: 'CPF', name: 'Titular' });
    prisma.customer.update.mockResolvedValue({ id: 'cust1', consumerId: 'cons1' });

    const created = await service.createForCustomer('cust1', {
      name: 'Titular',
      document: VALID_CPF,
      documentType: 'CPF',
    });

    expect(created.id).toBe('cons1');
    expect(prisma.customer.update).toHaveBeenCalledTimes(1);
    expect(prisma.customer.update.mock.calls[0][0]).toEqual({
      where: { id: 'cust1' },
      data: { consumerId: created.id },
    });
    expect(prisma.customer.update.mock.calls[0][0].data).not.toHaveProperty('name');
    expect(prisma.customer.update.mock.calls[0][0].data).not.toHaveProperty('email');
  });

  it('vincula consumidor existente sem criar outro registro', async () => {
    customerWithoutConsumer();
    prisma.consumer.findUnique.mockResolvedValue({
      id: 'cons9',
      name: 'Já cadastrado',
      document: OTHER_CPF,
      documentType: 'CPF',
    });
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.update.mockResolvedValue({ id: 'cust1', consumerId: 'cons9' });

    const linked = await service.createForCustomer('cust1', { consumerId: 'cons9' });

    expect(linked).toMatchObject({ id: 'cons9', document: OTHER_CPF });
    expect(prisma.consumer.create).not.toHaveBeenCalled();
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'cust1' },
      data: { consumerId: 'cons9' },
    });
    expect(prisma.consumer.findUnique).toHaveBeenCalledWith({ where: { id: 'cons9' } });
  });

  it('rejeita tipo de documento incompatível com o formato', async () => {
    customerWithoutConsumer();
    await expect(service.createForCustomer('cust1', {
      name: 'Titular',
      document: VALID_CNPJ,
      documentType: 'CPF',
    })).rejects.toThrow('O tipo de documento não corresponde ao formato informado.');
    expect(prisma.consumer.create).not.toHaveBeenCalled();
  });

  it('respeita as permissões de cliente já existentes', () => {
    expect(hasPermission('OPERADOR', 'CUSTOMERS_UPDATE')).toBe(false);
    expect(hasPermission('OPERADOR', 'CUSTOMERS_VIEW')).toBe(true);
    expect(hasPermission('COMERCIAL', 'CUSTOMERS_UPDATE')).toBe(true);
    expect(hasPermission('ADMIN', 'CUSTOMERS_VIEW')).toBe(true);
  });

  it('falha ao buscar cliente inexistente', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.findByCustomer('ausente')).rejects.toBeInstanceOf(NotFoundException);
  });
});
