import { MonitoringService } from './monitoring.service';

describe('MonitoringService.overview — dados de usuário interno', () => {
  const internalUser = { id: 'user-admin-1', name: 'Primeiro Admin Cadastrado' };
  const staffUser = { sub: 'staff', email: 's@b7.test', role: 'OPERADOR' };
  const portalUser = { sub: 'portal', email: 'p@b7.test', role: 'CUSTOMER' };

  const plant = {
    id: 'p1',
    name: 'Usina 1',
    address: 'Rua A',
    customerId: 'cust-a',
    customer: { id: 'cust-a', name: 'Cliente A' },
    installedPowerKw: 10,
    status: 'ACTIVE',
    latitude: null,
    longitude: null,
    inverters: [],
  };
  const alert = {
    id: 'a1',
    plantId: 'p1',
    title: 'Sem leitura',
    severity: 'WARNING',
    status: 'OPEN',
    occurredAt: new Date('2026-09-01T12:00:00Z'),
    ruleCode: 'NO_RECENT_READING',
    plant: { name: 'Usina 1', inverters: [] },
  };
  const computed = {
    energyKwh: 12.5,
    hasData: true,
    comparisonPercent: null,
    timezone: 'America/Sao_Paulo',
    series: [{ label: '10h', energyKwh: 1.5, collectedAt: '2026-09-01T13:00:00Z' }],
    emptyMessage: null,
    byPlant: { p1: 12.5 },
  };

  function setup(plantWhere: object | undefined) {
    const prisma = {
      plant: { findMany: jest.fn().mockResolvedValue([plant]) },
      alert: { findMany: jest.fn().mockResolvedValue([alert]) },
      customer: { count: jest.fn().mockResolvedValue(3) },
      user: {
        findFirst: jest.fn().mockResolvedValue(internalUser),
        findMany: jest.fn().mockResolvedValue([internalUser]),
        findUnique: jest.fn().mockResolvedValue(internalUser),
      },
    };
    const history = {
      parseQuery: jest.fn((query: object) => query),
      compute: jest.fn().mockResolvedValue(computed),
      latestReadings: jest.fn().mockResolvedValue([]),
    };
    const access = { buildPlantWhere: jest.fn().mockResolvedValue(plantWhere) };
    const service = new MonitoringService(prisma as never, history as never, access as never, {} as never);
    return { service, prisma, history, access };
  }

  it('overview continua funcionando e retorna os dados existentes (usuário interno)', async () => {
    const { service } = setup(undefined);
    const result = await service.overview('today', staffUser);
    expect(result.totals).toEqual({ plants: 1, active: 1, warning: 0, offline: 0, openAlerts: 1 });
    expect(result.dashboard).toMatchObject({
      period: 'today',
      timezone: 'America/Sao_Paulo',
      energyToday: { valueKwh: 12.5, hasData: true },
      energyMonth: { valueKwh: 12.5, hasData: true },
      plants: { total: 1, online: 1 },
      alerts: { total: 1, warning: 1 },
      customers: { total: 3 },
      history: { hasData: true, energyKwh: 12.5 },
    });
    expect(result.dashboard.generationSeries).toHaveLength(1);
    expect(result.dashboard.recentAlerts[0]).toMatchObject({ id: 'a1', plantName: 'Usina 1' });
    expect(result.dashboard.operationalPlants[0]).toMatchObject({ id: 'p1', customerName: 'Cliente A' });
  });

  it('não consulta a tabela User para montar o overview', async () => {
    const { service, prisma } = setup(undefined);
    await service.overview('today', staffUser);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('com usuário interno cadastrado, a resposta não expõe seu id/nome nem o campo operator', async () => {
    const { service } = setup(undefined);
    const result = await service.overview('today', staffUser);
    expect(result.dashboard).not.toHaveProperty('operator');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(internalUser.id);
    expect(serialized).not.toContain(internalUser.name);
  });

  it('perfil de portal (DASHBOARD_VIEW) não recebe dados de usuário interno e mantém escopo por Usina', async () => {
    const plantWhere = { customerId: { in: ['cust-a'] } };
    const { service, prisma, access } = setup(plantWhere);
    const result = await service.overview('today', portalUser);
    expect(access.buildPlantWhere).toHaveBeenCalledWith(portalUser);
    expect(prisma.plant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: plantWhere }));
    expect(result.dashboard).not.toHaveProperty('operator');
    expect(JSON.stringify(result)).not.toContain(internalUser.name);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(result.dashboard.customers.total).toBe(1);
    expect(prisma.customer.count).not.toHaveBeenCalled();
  });

  it('sem dados, overview não quebra (sem erro 500 pela remoção do campo)', async () => {
    const { service, prisma, history } = setup(undefined);
    prisma.plant.findMany.mockResolvedValue([]);
    prisma.alert.findMany.mockResolvedValue([]);
    history.compute.mockResolvedValue({ ...computed, energyKwh: null, hasData: false, series: [], byPlant: {} });
    const result = await service.overview('today', staffUser);
    expect(result.totals.plants).toBe(0);
    expect(result.dashboard.recentAlerts).toEqual([]);
    expect(result.dashboard).not.toHaveProperty('operator');
  });
});
