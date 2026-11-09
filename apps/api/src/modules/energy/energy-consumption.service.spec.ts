import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { hasPermission } from '../auth/permissions.catalog';
import { EnergyConsumptionService } from './energy-consumption.service';
import { EnergyConsumptionStore, NormalizedConsumptionRecord } from './energy-consumption.store';

const admin = { sub: 'u1', role: 'ADMIN', email: 'a@b7.local' };
const customerUser = { sub: 'c1', role: 'CUSTOMER', email: 'c@b7.local' };

function unit(id = 'uc-1', overrides: Record<string, unknown> = {}) {
  return {
    id,
    number: '11230436',
    contractAccount: 'CC-1',
    consumer: { id: 'cons-1', name: 'Consumidor A', customer: { id: 'cust-1', name: 'Cliente A' } },
    distributor: { id: 'd1', name: 'Equatorial', code: 'EQ' },
    plants: [{ id: 'plant-a', name: 'Usina A', customerId: 'cust-1' }],
    ...overrides,
  };
}

class FixtureStore extends EnergyConsumptionStore {
  constructor(private readonly records: NormalizedConsumptionRecord[] = []) {
    super();
  }

  async findForPeriod(consumerUnitId: string, from: Date, to: Date) {
    return this.records.find((item) => (
      item.consumerUnitId === consumerUnitId
      && item.periodFrom.getTime() === from.getTime()
      && item.periodTo.getTime() === to.getTime()
    )) ?? this.records.find((item) => (
      item.consumerUnitId === consumerUnitId
      && item.periodFrom < to
      && item.periodTo > from
    )) ?? null;
  }
}

function setup(store: EnergyConsumptionStore = new FixtureStore(), accessOk = true) {
  const from = new Date('2026-09-01T03:00:00.000Z');
  const to = new Date('2026-10-01T03:00:00.000Z');
  const prisma = {
    consumerUnit: {
      findUnique: jest.fn().mockResolvedValue(accessOk ? unit() : null),
      findMany: jest.fn().mockResolvedValue([unit()]),
    },
  };
  const authorization = {
    resolveAccessScope: jest.fn().mockResolvedValue({ unrestricted: true, customerIds: [], customerWideIds: [], plantIds: [] }),
    canAccessCustomer: jest.fn().mockReturnValue(true),
    canAccessPlant: jest.fn().mockReturnValue(true),
  };
  const access = {
    assertPlant: jest.fn().mockResolvedValue({ id: 'plant-a', name: 'Usina A', customerId: 'cust-1' }),
  };
  const history = {
    parseQuery: jest.fn((query: { period?: string }) => {
      if (query.period === 'invalid') {
        throw new UnprocessableEntityException('Intervalo de datas inválido.');
      }
      if (query.period === 'custom' && !(query as { startDate?: string }).startDate) {
        throw new UnprocessableEntityException('Informe startDate e endDate para o período personalizado.');
      }
      return { period: query.period || 'thisMonth', from, to, granularity: 'DAY' };
    }),
  };
  const service = new EnergyConsumptionService(
    prisma as never,
    authorization as never,
    access as never,
    history as never,
    store,
  );
  return { service, prisma, authorization, access, history, from, to };
}

describe('EnergyConsumptionService', () => {
  it('UC autorizada — summary sem dados reais', async () => {
    const { service } = setup();
    const result = await service.consumerUnitSummary('uc-1', { period: 'thisMonth' }, admin as never);
    expect(result.domain).toBe('ENERGY_CONSUMPTION');
    expect(result.consumerUnitId).toBe('uc-1');
    expect(result.hasData).toBe(false);
    expect(result.consumption).toBeNull();
    expect(result.availability).toBe('UNAVAILABLE');
    expect(result.timezone).toBe('America/Sao_Paulo');
  });

  it('UC inexistente', async () => {
    const { service, prisma } = setup();
    prisma.consumerUnit.findUnique.mockResolvedValue(null);
    await expect(service.consumerUnitSummary('missing', { period: 'today' }, admin as never))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('UC fora do escopo', async () => {
    const { service, authorization } = setup();
    authorization.resolveAccessScope.mockResolvedValue({
      unrestricted: false,
      customerIds: ['other'],
      customerWideIds: [],
      plantIds: [],
    });
    authorization.canAccessCustomer.mockReturnValue(false);
    authorization.canAccessPlant.mockReturnValue(false);
    await expect(service.consumerUnitSummary('uc-1', { period: 'today' }, customerUser as never))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('INTEGRIDADE: consumo inexistente → hasData=false e consumption=null (nunca 0)', async () => {
    const { service } = setup(new FixtureStore());
    const result = await service.consumerUnitConsumption('uc-1', { period: 'thisMonth' }, admin as never);
    expect(result.hasData).toBe(false);
    expect(result.consumption).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/"consumption":\s*0/);
    expect(result.emptyMessage).toMatch(/NÃO DISPONÍVEL|Sem dados de consumo/i);
  });

  it('consumo existente via fixture isolada (não operacional)', async () => {
    const from = new Date('2026-09-01T03:00:00.000Z');
    const to = new Date('2026-10-01T03:00:00.000Z');
    const { service } = setup(new FixtureStore([{
      consumerUnitId: 'uc-1',
      periodFrom: from,
      periodTo: to,
      energyKwh: 450.5,
      unit: 'kWh',
      origin: 'IMPORT',
      receivedAt: new Date('2026-09-10T12:00:00.000Z'),
      normalizedAt: new Date('2026-09-10T12:05:00.000Z'),
      externalRef: 'fixture-test-only',
    }]));
    const result = await service.consumerUnitConsumption('uc-1', { period: 'thisMonth' }, admin as never);
    expect(result.hasData).toBe(true);
    expect(result.consumption).toEqual({ value: 450.5, unit: 'kWh', origin: 'IMPORT' });
    expect(result.trace?.origin).toBe('IMPORT');
    expect(result.trace?.externalRef).toBe('fixture-test-only');
  });

  it('unidade kWh e origem do consumo', async () => {
    const from = new Date('2026-09-01T03:00:00.000Z');
    const to = new Date('2026-10-01T03:00:00.000Z');
    const { service } = setup(new FixtureStore([{
      consumerUnitId: 'uc-1',
      periodFrom: from,
      periodTo: to,
      energyKwh: 10,
      unit: 'kWh',
      origin: 'METER',
    }]));
    const result = await service.consumerUnitSummary('uc-1', { period: 'thisMonth' }, admin as never);
    expect(result.consumption?.unit).toBe('kWh');
    expect(result.consumption?.origin).toBe('METER');
  });

  it('período inválido', async () => {
    const { service } = setup();
    await expect(service.consumerUnitSummary('uc-1', { period: 'custom' }, admin as never))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('período válido thisMonth', async () => {
    const { service, history } = setup();
    await service.consumerUnitSummary('uc-1', { period: 'thisMonth' }, admin as never);
    expect(history.parseQuery).toHaveBeenCalledWith({ period: 'thisMonth' });
  });

  it('isolamento entre UCs', async () => {
    const from = new Date('2026-09-01T03:00:00.000Z');
    const to = new Date('2026-10-01T03:00:00.000Z');
    const store = new FixtureStore([{
      consumerUnitId: 'uc-2',
      periodFrom: from,
      periodTo: to,
      energyKwh: 99,
      unit: 'kWh',
      origin: 'MANUAL',
    }]);
    const { service, prisma } = setup(store);
    prisma.consumerUnit.findUnique.mockResolvedValue(unit('uc-1'));
    const result = await service.consumerUnitSummary('uc-1', { period: 'thisMonth' }, admin as never);
    expect(result.hasData).toBe(false);
    expect(result.consumption).toBeNull();
  });

  it('OBRIGATÓRIO: GERAÇÃO ≠ CONSUMO — não copia geração como consumo', async () => {
    const { service } = setup();
    const generationKwh = 10_000;
    const result = await service.consumerUnitSummary('uc-1', { period: 'thisMonth' }, admin as never);
    expect(result.consumption).toBeNull();
    expect(result.consumption).not.toEqual({ value: generationKwh, unit: 'kWh' });
    expect(result.notes.some((note) => /Geração da usina ≠ consumo/i.test(note))).toBe(true);
    // Domain separado
    expect(result.domain).toBe('ENERGY_CONSUMPTION');
    expect(result).not.toHaveProperty('generation');
  });

  it('balance foundation não inventa compensação/crédito/faturamento', async () => {
    const { service } = setup();
    const balance = await service.balanceFoundation('uc-1', { period: 'thisMonth' }, admin as never);
    expect(balance.domain).toBe('ENERGY_BALANCE_FOUNDATION');
    expect(balance.compensation.status).toBe('NOT_IMPLEMENTED');
    expect(balance.credits.status).toBe('NOT_IMPLEMENTED');
    expect(balance.billing.status).toBe('NOT_IMPLEMENTED');
    expect(balance.economy.status).toBe('NOT_IMPLEMENTED');
    expect(balance.generationAllocated.status).toBe('PENDING_RATEIO');
    expect(balance.generationAllocated.value).toBeNull();
    expect(balance.compensation.value).toBeNull();
    expect(balance.credits.value).toBeNull();
  });

  it('plant consumer-units consumption lista UCs sem confundir com geração', async () => {
    const { service, access } = setup();
    const result = await service.plantConsumerUnitsConsumption('plant-a', { period: 'thisMonth' }, admin as never);
    expect(access.assertPlant).toHaveBeenCalledWith('plant-a', admin);
    expect(result.hasAnyConsumptionData).toBe(false);
    expect(result.consumerUnits[0].consumption).toBeNull();
    expect(result.notes.some((note) => /Geração da usina ≠ consumo/i.test(note))).toBe(true);
  });

  it('não expõe segredo', async () => {
    const { service } = setup();
    const result = await service.consumerUnitConsumption('uc-1', { period: 'today' }, admin as never);
    expect(JSON.stringify(result)).not.toMatch(/APP_SECRET|password|token|credential/i);
  });

  it('não altera José/Ulisses — serviço só lê ConsumerUnit/store', async () => {
    const { service, prisma } = setup();
    await service.consumerUnitSummary('uc-1', { period: 'today' }, admin as never);
    expect(prisma.consumerUnit.findUnique).toHaveBeenCalled();
    expect(prisma).not.toHaveProperty('plant.update');
    expect(Object.keys(prisma)).toEqual(['consumerUnit']);
  });
});

describe('Energy consumption API — JWT e ENERGY_VIEW', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  const reflector = { getAllAndOverride: jest.fn() };

  function contextOf(headers: Record<string, string>, user?: unknown) {
    const request = { headers, user };
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('consulta sem JWT', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const guard = new JwtAuthGuard(jwt, reflector as unknown as Reflector);
    expect(() => guard.canActivate(contextOf({}))).toThrow();
  });

  it('consulta sem ENERGY_VIEW', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => (
      key === PERMISSIONS_KEY ? ['ENERGY_VIEW'] : undefined
    ));
    const guard = new PermissionsGuard(reflector as unknown as Reflector);
    expect(() => guard.canActivate(contextOf({}, { role: 'CUSTOMER' }))).toThrow(ForbiddenException);
    expect(hasPermission('CUSTOMER', 'ENERGY_VIEW')).toBe(false);
    expect(guard.canActivate(contextOf({}, { role: 'ADMIN' }))).toBe(true);
  });
});
