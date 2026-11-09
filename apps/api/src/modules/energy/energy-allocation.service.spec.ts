import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { EnergyRateioVersionStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { EnergyAllocationService } from './energy-allocation.service';

const admin = { sub: 'u1', role: 'ADMIN', email: 'a@b7.local' };

function version(opts: {
  id: string;
  number: number;
  from: string;
  to: string | null;
  lines: Array<{ uc: string; consumer: string; name: string; pct: string; number: string }>;
}) {
  return {
    id: opts.id,
    plantId: 'plant-1',
    versionNumber: opts.number,
    validFrom: new Date(opts.from),
    validTo: opts.to ? new Date(opts.to) : null,
    status: EnergyRateioVersionStatus.ACTIVE,
    lines: opts.lines.map((line, index) => ({
      id: `l-${opts.id}-${index}`,
      consumerUnitId: line.uc,
      consumerId: line.consumer,
      percentage: { toString: () => line.pct },
      consumerUnit: { id: line.uc, number: line.number, contractAccount: null, status: 'ACTIVE', consumerId: line.consumer },
      consumer: { id: line.consumer, name: line.name },
    })),
  };
}

describe('EnergyAllocationService', () => {
  function setup(opts?: {
    versions?: ReturnType<typeof version>[];
    generations?: Array<{ hasData: boolean; energyKwh: number | null; source?: string }>;
  }) {
    const generations = [...(opts?.generations ?? [{ hasData: true, energyKwh: 100_000, source: 'ENERGY_TOTAL' }])];
    const prisma = {
      energyRateioVersion: {
        findMany: jest.fn().mockResolvedValue(opts?.versions ?? [
          version({
            id: 'v1',
            number: 1,
            from: '2026-09-01T03:00:00.000Z',
            to: null,
            lines: [
              { uc: 'uc-a', consumer: 'c-a', name: 'A', pct: '40', number: '001' },
              { uc: 'uc-b', consumer: 'c-b', name: 'B', pct: '35', number: '002' },
              { uc: 'uc-c', consumer: 'c-c', name: 'C', pct: '25', number: '003' },
            ],
          }),
        ]),
      },
    };
    const access = {
      assertPlant: jest.fn().mockImplementation(async (id: string) => {
        if (id === 'forbidden') throw new NotFoundException('Usina não encontrada.');
        return { id: 'plant-1', name: 'Usina Teste', status: 'ACTIVE', customerId: 'cust' };
      }),
    };
    const history = {
      parseQuery: jest.fn().mockReturnValue({
        period: 'thisMonth',
        granularity: 'DAY',
        from: new Date('2026-09-01T03:00:00.000Z'),
        to: new Date('2026-10-01T03:00:00.000Z'),
        plantId: 'plant-1',
      }),
      compute: jest.fn().mockImplementation(async () => {
        const next = generations.shift() ?? { hasData: false, energyKwh: null };
        return next;
      }),
      plantHistory: jest.fn(),
    };
    const service = new EnergyAllocationService(prisma as never, access as never, history as never);
    return { service, prisma, access, history };
  }

  it('100000 + 40/35/25', async () => {
    const { service } = setup();
    const result = await service.plantAllocations('plant-1', { period: 'thisMonth' }, admin as never);
    expect(result.hasData).toBe(true);
    expect(result.generationKwh).toBe('100000');
    expect(result.allocations.map((item) => item.allocatedKwh)).toEqual(['40000', '35000', '25000']);
    expect(result.allocatedTotalKwh).toBe('100000');
    expect(result.notes.some((note) => /apenas ALOCAÇÃO ENERGÉTICA/i.test(note))).toBe(true);
    expect(result.allocations[0]).not.toHaveProperty('credit');
    expect(result.allocations[0]).not.toHaveProperty('compensated');
    expect(result.allocations[0]).not.toHaveProperty('balance');
    expect(result).not.toHaveProperty('billing');
  });

  it('33.33/33.33/33.34 sobre 100', async () => {
    const { service } = setup({
      generations: [{ hasData: true, energyKwh: 100, source: 'ENERGY_TOTAL' }],
      versions: [
        version({
          id: 'v1',
          number: 1,
          from: '2026-09-01T03:00:00.000Z',
          to: null,
          lines: [
            { uc: 'uc-a', consumer: 'c-a', name: 'A', pct: '33.33', number: '001' },
            { uc: 'uc-b', consumer: 'c-b', name: 'B', pct: '33.33', number: '002' },
            { uc: 'uc-c', consumer: 'c-c', name: 'C', pct: '33.34', number: '003' },
          ],
        }),
      ],
    });
    const result = await service.plantAllocations('plant-1', { period: 'thisMonth' }, admin as never);
    expect(result.allocations.map((item) => item.allocatedKwh)).toEqual(['33.33', '33.33', '33.34']);
  });

  it('ausência de geração → hasData false e generationKwh null', async () => {
    const { service } = setup({ generations: [{ hasData: false, energyKwh: null }] });
    const result = await service.plantAllocations('plant-1', { period: 'thisMonth' }, admin as never);
    expect(result.hasData).toBe(false);
    expect(result.generationKwh).toBeNull();
    expect(result.allocations).toEqual([]);
    expect(result.emptyMessage).toMatch(/Sem geração/i);
  });

  it('geração zero REAL (hasData) aloca zeros — distinto de ausência', async () => {
    const { service } = setup({ generations: [{ hasData: true, energyKwh: 0, source: 'ENERGY_TOTAL' }] });
    const result = await service.plantAllocations('plant-1', { period: 'thisMonth' }, admin as never);
    expect(result.hasData).toBe(true);
    expect(result.generationKwh).toBe('0');
    expect(result.allocations.every((item) => item.allocatedKwh === '0')).toBe(true);
  });

  it('rateio sem 100% rejeita', async () => {
    const { service } = setup({
      versions: [
        version({
          id: 'v1',
          number: 1,
          from: '2026-09-01T03:00:00.000Z',
          to: null,
          lines: [
            { uc: 'uc-a', consumer: 'c-a', name: 'A', pct: '40', number: '001' },
            { uc: 'uc-b', consumer: 'c-b', name: 'B', pct: '30', number: '002' },
          ],
        }),
      ],
    });
    await expect(service.plantAllocations('plant-1', { period: 'thisMonth' }, admin as never))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('múltiplas versões segmentam o período', async () => {
    const { service, history } = setup({
      versions: [
        version({
          id: 'v1',
          number: 1,
          from: '2026-09-01T03:00:00.000Z',
          to: '2026-09-15T03:00:00.000Z',
          lines: [
            { uc: 'uc-a', consumer: 'c-a', name: 'A', pct: '70', number: '001' },
            { uc: 'uc-b', consumer: 'c-b', name: 'B', pct: '30', number: '002' },
          ],
        }),
        version({
          id: 'v2',
          number: 2,
          from: '2026-09-15T03:00:00.000Z',
          to: null,
          lines: [
            { uc: 'uc-a', consumer: 'c-a', name: 'A', pct: '50', number: '001' },
            { uc: 'uc-b', consumer: 'c-b', name: 'B', pct: '50', number: '002' },
          ],
        }),
      ],
      generations: [
        { hasData: true, energyKwh: 1000, source: 'ENERGY_TOTAL' },
        { hasData: true, energyKwh: 2000, source: 'ENERGY_TOTAL' },
      ],
    });
    const result = await service.plantAllocations('plant-1', { period: 'thisMonth' }, admin as never);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].rateioLabel).toBe('V1');
    expect(result.segments[1].rateioLabel).toBe('V2');
    expect(history.compute).toHaveBeenCalledTimes(2);
    expect(result.generationKwh).toBe('3000');
    // 70%*1000 + 50%*2000 = 700+1000 = 1700 for A
    expect(result.allocations.find((item) => item.consumerUnitId === 'uc-a')?.allocatedKwh).toBe('1700');
    expect(result.allocations.find((item) => item.consumerUnitId === 'uc-b')?.allocatedKwh).toBe('1300');
  });

  it('sem rateio → hasData false', async () => {
    const { service } = setup({ versions: [], generations: [{ hasData: true, energyKwh: 100 }] });
    const result = await service.plantAllocations('plant-1', { period: 'thisMonth' }, admin as never);
    expect(result.hasData).toBe(false);
    expect(result.allocations).toEqual([]);
    expect(result.emptyMessage).toMatch(/Sem Rateio/i);
  });

  it('planta fora de escopo', async () => {
    const { service } = setup();
    await expect(service.plantAllocations('forbidden', { period: 'today' }, admin as never))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('não usa compute para AUXSOL e não altera Monitoring', async () => {
    const { service, history } = setup();
    await service.plantAllocations('plant-1', { period: 'thisMonth' }, admin as never);
    expect(history.compute).toHaveBeenCalled();
    expect(history.plantHistory).not.toHaveBeenCalled();
  });

  it('não transforma percentual em conceito de crédito', async () => {
    const { service } = setup();
    const result = await service.plantAllocations('plant-1', { period: 'thisMonth' }, admin as never);
    expect(result.domain).toBe('ENERGY_ALLOCATION');
    expect(result.allocations[0]).toHaveProperty('allocatedKwh');
    expect(result.allocations[0]).not.toHaveProperty('credit');
  });
});

describe('Energy allocation API guards', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  const reflector = { getAllAndOverride: jest.fn() };

  function contextOf(user?: unknown) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ headers: {}, user }) }),
    } as unknown as ExecutionContext;
  }

  it('sem JWT → 401', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const guard = new JwtAuthGuard(jwt, reflector as unknown as Reflector);
    expect(() => guard.canActivate(contextOf())).toThrow();
  });

  it('sem ENERGY_VIEW → 403', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => (
      key === PERMISSIONS_KEY ? ['ENERGY_VIEW'] : undefined
    ));
    const guard = new PermissionsGuard(reflector as unknown as Reflector);
    expect(() => guard.canActivate(contextOf({ role: 'CUSTOMER' }))).toThrow(ForbiddenException);
  });
});
