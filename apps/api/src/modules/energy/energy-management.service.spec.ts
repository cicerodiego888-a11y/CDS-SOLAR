import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { hasPermission } from '../auth/permissions.catalog';
import { EnergyManagementService } from './energy-management.service';

const admin = { sub: 'u1', role: 'ADMIN', email: 'a@b7.local' };

function historyResult(overrides: Record<string, unknown> = {}) {
  return {
    timezone: 'America/Sao_Paulo',
    period: 'today',
    granularity: 'HOUR',
    from: '2026-09-26T03:00:00.000Z',
    to: '2026-09-27T03:00:00.000Z',
    unit: { power: 'kW', energy: 'kWh', installed: 'kWp' },
    hasData: false,
    energyKwh: null,
    previousEnergyKwh: null,
    comparisonPercent: null,
    series: [],
    resets: 0,
    source: 'NONE',
    notes: ['Potência instantânea não é convertida em energia.'],
    emptyMessage: 'Não existem leituras para o período.',
    byPlant: {},
    byInverter: {},
    ...overrides,
  };
}

function plant(id = 'plant-a', bindings: unknown[] = []) {
  return {
    id,
    name: `Usina ${id}`,
    inverters: [{ id: 'inv-1', bindings }],
  };
}

function setup(historyOverrides: Record<string, unknown> = {}, plantOverrides?: ReturnType<typeof plant>) {
  const access = {
    assertPlant: jest.fn().mockResolvedValue(plantOverrides ?? plant()),
  };
  const history = {
    plantHistory: jest.fn().mockResolvedValue(historyResult(historyOverrides)),
  };
  const service = new EnergyManagementService(history as never, access as never);
  return { service, access, history };
}

describe('EnergyManagementService', () => {
  it('consulta autorizada retorna domínio ENERGY_MANAGEMENT', async () => {
    const { service, access, history } = setup({
      hasData: true,
      energyKwh: 123.45,
      source: 'ENERGY_TOTAL',
      emptyMessage: null,
      series: [{ label: '10:00', bucket: '2026-09-26T10', energyKwh: 123.45, collectedAt: '2026-09-26T13:00:00.000Z' }],
    });
    const result = await service.plantSummary('plant-a', { period: 'today' }, admin as never);
    expect(result.domain).toBe('ENERGY_MANAGEMENT');
    expect(result.plantId).toBe('plant-a');
    expect(result.hasData).toBe(true);
    expect(result.generation).toEqual({ value: 123.45, unit: 'kWh', source: 'ENERGY_TOTAL' });
    expect(result.timezone).toBe('America/Sao_Paulo');
    expect(access.assertPlant).toHaveBeenCalledWith('plant-a', admin);
    expect(history.plantHistory).toHaveBeenCalledWith('plant-a', { period: 'today' }, admin);
  });

  it('INTEGRIDADE: sem reading → hasData=false e generation=null (nunca 0)', async () => {
    const { service } = setup({ hasData: false, energyKwh: null });
    const result = await service.plantSummary('plant-a', { period: 'today' }, admin as never);
    expect(result.hasData).toBe(false);
    expect(result.generation).toBeNull();
    expect(result.generation).not.toEqual({ value: 0 });
    expect(JSON.stringify(result)).not.toMatch(/"generation":\s*0/);
    expect(result.emptyMessage).toMatch(/leituras|dados/i);
  });

  it('ausência ≠ zero mesmo se energyKwh vier 0 com hasData false', async () => {
    const { service } = setup({ hasData: false, energyKwh: 0 as never });
    const result = await service.plantSummary('plant-a', { period: 'last7days' }, admin as never);
    expect(result.hasData).toBe(false);
    expect(result.generation).toBeNull();
  });

  it('unidade kWh e geração real com hasData', async () => {
    const { service } = setup({ hasData: true, energyKwh: 0, source: 'ENERGY_TODAY', emptyMessage: null });
    const result = await service.plantGeneration('plant-a', { period: 'today' }, admin as never);
    expect(result.hasData).toBe(true);
    expect(result.generation).toEqual({ value: 0, unit: 'kWh', source: 'ENERGY_TODAY' });
    expect(result.series).toEqual([]);
  });

  it('período válido e custom via history', async () => {
    const { service, history } = setup({ hasData: true, energyKwh: 10, emptyMessage: null });
    await service.plantSummary('plant-a', {
      period: 'custom',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
    }, admin as never);
    expect(history.plantHistory).toHaveBeenCalledWith(
      'plant-a',
      { period: 'custom', startDate: '2026-09-01', endDate: '2026-09-07' },
      admin,
    );
  });

  it('período inválido propaga UnprocessableEntityException', async () => {
    const access = { assertPlant: jest.fn().mockResolvedValue(plant()) };
    const history = {
      plantHistory: jest.fn().mockRejectedValue(new UnprocessableEntityException('Intervalo de datas inválido.')),
    };
    const service = new EnergyManagementService(history as never, access as never);
    await expect(service.plantSummary('plant-a', { period: 'custom' }, admin as never))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('plant inexistente', async () => {
    const access = { assertPlant: jest.fn().mockRejectedValue(new NotFoundException('Usina não encontrada.')) };
    const history = { plantHistory: jest.fn() };
    const service = new EnergyManagementService(history as never, access as never);
    await expect(service.plantSummary('missing', { period: 'today' }, admin as never))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(history.plantHistory).not.toHaveBeenCalled();
  });

  it('consulta sem autorização de planta', async () => {
    const access = { assertPlant: jest.fn().mockRejectedValue(new ForbiddenException('Acesso negado')) };
    const history = { plantHistory: jest.fn() };
    const service = new EnergyManagementService(history as never, access as never);
    await expect(service.plantSummary('plant-b', { period: 'today' }, { ...admin, role: 'CUSTOMER' } as never))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('isolamento entre usinas — assertPlant e plantHistory usam o plantId pedido', async () => {
    const { service, access, history } = setup({ hasData: true, energyKwh: 5, emptyMessage: null }, plant('plant-b'));
    await service.plantSummary('plant-b', { period: 'thisMonth' }, admin as never);
    expect(access.assertPlant).toHaveBeenCalledWith('plant-b', admin);
    expect(history.plantHistory.mock.calls[0][0]).toBe('plant-b');
  });

  it('usina sem integração e sem leitura', async () => {
    const { service } = setup({ hasData: false, energyKwh: null }, plant('plant-a', []));
    const result = await service.plantSummary('plant-a', { period: 'today' }, admin as never);
    expect(result.hasIntegrationBinding).toBe(false);
    expect(result.hasData).toBe(false);
    expect(result.generation).toBeNull();
  });

  it('usina com integração mas sem leitura', async () => {
    const { service } = setup(
      { hasData: false, energyKwh: null },
      plant('plant-a', [{ provider: 'AUXSOL', status: 'CONNECTED' }]),
    );
    const result = await service.plantSummary('plant-a', { period: 'yesterday' }, admin as never);
    expect(result.hasIntegrationBinding).toBe(true);
    expect(result.hasData).toBe(false);
    expect(result.generation).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/APP_SECRET|appSecret|password|token/i);
  });

  it('múltiplas leituras — série só quando includeSeries e hasData', async () => {
    const series = [
      { label: '08:00', bucket: 'a', energyKwh: 1, collectedAt: 'x' },
      { label: '09:00', bucket: 'b', energyKwh: 2, collectedAt: 'y' },
    ];
    const { service } = setup({ hasData: true, energyKwh: 3, emptyMessage: null, series });
    const summary = await service.plantSummary('plant-a', { period: 'today' }, admin as never);
    expect(summary).not.toHaveProperty('series');
    const generation = await service.plantGeneration('plant-a', { period: 'today' }, admin as never);
    expect(generation.series).toEqual(series);
  });

  it('não expõe segredo de fabricante', async () => {
    const { service } = setup({ hasData: true, energyKwh: 1, emptyMessage: null });
    const result = await service.plantSummary('plant-a', { period: 'today' }, admin as never);
    expect(JSON.stringify(result)).not.toMatch(/secret|credential|password|appId|APP_ID/i);
  });
});

describe('Energy API — JWT e ENERGY_VIEW', () => {
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

  it('endpoint protegido por JWT', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const guard = new JwtAuthGuard(jwt, reflector as unknown as Reflector);
    expect(() => guard.canActivate(contextOf({}))).toThrow();
  });

  it('CUSTOMER sem ENERGY_VIEW recebe 403', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => (
      key === PERMISSIONS_KEY ? ['ENERGY_VIEW'] : undefined
    ));
    const guard = new PermissionsGuard(reflector as unknown as Reflector);
    expect(() => guard.canActivate(contextOf({}, { role: 'CUSTOMER' }))).toThrow(ForbiddenException);
    expect(guard.canActivate(contextOf({}, { role: 'ADMIN' }))).toBe(true);
    expect(guard.canActivate(contextOf({}, { role: 'COMERCIAL' }))).toBe(true);
    expect(guard.canActivate(contextOf({}, { role: 'OPERADOR' }))).toBe(true);
  });

  it('catálogo concede ENERGY_VIEW aos perfis operacionais e comerciais', () => {
    expect(hasPermission('ADMIN', 'ENERGY_VIEW')).toBe(true);
    expect(hasPermission('OPERADOR', 'ENERGY_VIEW')).toBe(true);
    expect(hasPermission('TECNICO', 'ENERGY_VIEW')).toBe(true);
    expect(hasPermission('COMERCIAL', 'ENERGY_VIEW')).toBe(true);
    expect(hasPermission('CONSUMIDOR', 'ENERGY_VIEW')).toBe(false);
  });
});
