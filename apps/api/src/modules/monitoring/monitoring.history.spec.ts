import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { MonitoringAccessService } from './monitoring.access';
import {
  MonitoringHistoryService,
  sumLatestEnergyField,
  sumLatestPowerKw,
} from './monitoring.history.service';

describe('MonitoringHistoryService', () => {
  it('intervalo inválido retorna 422', () => {
    const service = new MonitoringHistoryService({} as never, {} as never);
    expect(() => service.parseQuery({ period: 'custom', startDate: '2026-09-10', endDate: '2026-09-01' }))
      .toThrow(UnprocessableEntityException);
  });

  it('período personalizado exige datas', () => {
    const service = new MonitoringHistoryService({} as never, {} as never);
    expect(() => service.parseQuery({ period: 'custom' })).toThrow(UnprocessableEntityException);
  });

  it('histórico vazio sem inventar zero', async () => {
    const prisma = {
      monitoringReading: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const access = {
      assertPlant: jest.fn(),
      assertInverter: jest.fn(),
      buildPlantWhere: jest.fn().mockResolvedValue(undefined),
    };
    const service = new MonitoringHistoryService(prisma as never, access as never);
    const result = await service.history({ period: 'today' }, { sub: 'u1', role: 'ADMIN', email: 'a' });
    expect(result.hasData).toBe(false);
    expect(result.emptyMessage).toBe('Não existem leituras para o período.');
    expect(result.energyKwh).toBeNull();
  });

  it('sumLatestPowerKw e sumLatestEnergyField não inventam zero', () => {
    expect(sumLatestPowerKw([])).toEqual({ valueKw: null, hasData: false });
    expect(sumLatestEnergyField([], 'energyTodayKwh')).toEqual({ valueKwh: null, hasData: false });
    expect(sumLatestEnergyField([{ energyMonthKwh: 12 }, { energyMonthKwh: null }], 'energyMonthKwh'))
      .toEqual({ valueKwh: 12, hasData: true });
  });

  it('filtra usina e inversor na consulta', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new MonitoringHistoryService({
      monitoringReading: { findMany },
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as never, {
      assertPlant: jest.fn().mockResolvedValue({ id: 'p1' }),
      assertInverter: jest.fn().mockResolvedValue({ id: 'i1', plantId: 'p1' }),
      buildPlantWhere: jest.fn().mockResolvedValue(undefined),
    } as never);
    await service.history({ period: 'today', plantId: 'p1', inverterId: 'i1' }, { sub: 'u1', role: 'ADMIN', email: 'a' });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ plantId: 'p1', inverterId: 'i1' }),
    }));
  });
});

describe('MonitoringAccessService', () => {
  it('usina inexistente = 404', async () => {
    const authorization = { assertPlantAccess: jest.fn() };
    const access = new MonitoringAccessService(
      { plant: { findUnique: jest.fn().mockResolvedValue(null) } } as never,
      authorization as never,
    );
    await expect(access.assertPlant('missing', { sub: 'u', role: 'ADMIN', email: 'a' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('inversor inexistente = 404', async () => {
    const authorization = { assertPlantAccess: jest.fn() };
    const access = new MonitoringAccessService(
      { inverter: { findUnique: jest.fn().mockResolvedValue(null) } } as never,
      authorization as never,
    );
    await expect(access.assertInverter('missing', { sub: 'u', role: 'ADMIN', email: 'a' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('CUSTOMER sem acesso à usina = 403/404 via AuthorizationService', async () => {
    const authorization = {
      assertPlantAccess: jest.fn().mockRejectedValue(new NotFoundException('Usina não encontrada.')),
    };
    const access = new MonitoringAccessService(
      {
        plant: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', customerId: 'other' }) },
      } as never,
      authorization as never,
    );
    await expect(access.assertPlant('p1', { sub: 'u', role: 'CUSTOMER', email: 'c' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
