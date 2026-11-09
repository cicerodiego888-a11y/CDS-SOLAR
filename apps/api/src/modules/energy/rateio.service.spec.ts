import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { EnergyRateioVersionStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { hasPermission } from '../auth/permissions.catalog';
import { RateioService } from './rateio.service';

const admin = { sub: 'u-admin', role: 'ADMIN', email: 'a@b7.local' };

function line(uc: string, consumer: string, percentage: string | number) {
  return { consumerUnitId: uc, consumerId: consumer, percentage };
}

describe('RateioService', () => {
  function setup(opts?: {
    plantStatus?: string;
    units?: Array<{ id: string; number: string; status: string; consumerId: string; consumer: { id: string; name: string; status: string } }>;
    existing?: Array<Record<string, unknown>>;
  }) {
    const units = opts?.units ?? [
      { id: 'uc-a', number: '001', status: 'ACTIVE', consumerId: 'c-a', consumer: { id: 'c-a', name: 'João', status: 'ACTIVE' } },
      { id: 'uc-b', number: '002', status: 'ACTIVE', consumerId: 'c-b', consumer: { id: 'c-b', name: 'Maria', status: 'ACTIVE' } },
      { id: 'uc-c', number: '003', status: 'ACTIVE', consumerId: 'c-c', consumer: { id: 'c-c', name: 'Empresa', status: 'ACTIVE' } },
    ];

    const createdVersions: Array<Record<string, unknown>> = [...(opts?.existing ?? [])];
    let versionSeq = createdVersions.length;

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'plant-1' }]),
      energyRateioVersion: {
        findMany: jest.fn().mockImplementation(async ({ where }: { where?: { status?: string } }) => {
          return createdVersions.filter((item) => {
            if (where?.status && item.status !== where.status) return false;
            return true;
          });
        }),
        findFirst: jest.fn().mockImplementation(async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: { versionNumber: string } }) => {
          if (where?.id) return createdVersions.find((item) => item.id === where.id) ?? null;
          if (orderBy?.versionNumber === 'desc') {
            return [...createdVersions].sort((a, b) => Number(b.versionNumber) - Number(a.versionNumber))[0] ?? null;
          }
          return createdVersions[0] ?? null;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const item = createdVersions.find((row) => row.id === where.id);
          if (!item) throw new Error('missing');
          Object.assign(item, data);
          return item;
        }),
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          versionSeq += 1;
          const lines = ((data.lines as { create: Array<Record<string, unknown>> }).create ?? []).map((row, index) => ({
            id: `line-${versionSeq}-${index}`,
            consumerUnitId: row.consumerUnitId,
            consumerId: row.consumerId,
            percentage: { toString: () => String(row.percentage) },
            consumerUnit: {
              id: row.consumerUnitId,
              number: units.find((u) => u.id === row.consumerUnitId)?.number ?? row.consumerUnitId,
              contractAccount: null,
              status: 'ACTIVE',
              distributor: { id: 'd1', name: 'Dist', code: 'D' },
            },
            consumer: {
              id: row.consumerId,
              name: units.find((u) => u.consumerId === row.consumerId)?.consumer.name ?? 'X',
              document: '000',
              status: 'ACTIVE',
            },
          }));
          const version = {
            id: `rv-${versionSeq}`,
            plantId: data.plantId,
            versionNumber: data.versionNumber,
            validFrom: data.validFrom,
            validTo: data.validTo ?? null,
            status: data.status,
            modality: data.modality ?? null,
            reason: data.reason ?? null,
            createdBy: data.createdBy,
            createdAt: new Date('2026-09-26T12:00:00.000Z'),
            updatedAt: new Date('2026-09-26T12:00:00.000Z'),
            plant: { id: 'plant-1', name: 'Usina Teste', status: opts?.plantStatus ?? 'ACTIVE', customerId: 'cust-1' },
            lines,
          };
          createdVersions.push(version);
          return version;
        }),
      },
    };

    const prisma = {
      consumerUnit: {
        findMany: jest.fn().mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => (
          units.filter((unit) => where.id.in.includes(unit.id))
        )),
      },
      energyRateioVersion: {
        findMany: jest.fn().mockImplementation(async () => createdVersions),
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
          if (where.id) return createdVersions.find((item) => item.id === where.id && item.plantId === where.plantId) ?? null;
          return null;
        }),
        update: tx.energyRateioVersion.update,
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const access = {
      assertPlant: jest.fn().mockImplementation(async (plantId: string) => {
        if (plantId === 'missing') throw new NotFoundException('Usina não encontrada.');
        if (plantId === 'forbidden') throw new NotFoundException('Usina não encontrada.');
        return { id: plantId, name: 'Uina Teste', status: opts?.plantStatus ?? 'ACTIVE', customerId: 'cust-1' };
      }),
    };

    const service = new RateioService(prisma as never, access as never);
    return { service, prisma, access, createdVersions, tx, units };
  }

  const validDto = {
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2026-07-01T00:00:00.000Z',
    lines: [line('uc-a', 'c-a', 40), line('uc-b', 'c-b', 35), line('uc-c', 'c-c', 25)],
  };

  it('cria Rateio válido', async () => {
    const { service } = setup();
    const result = await service.create('plant-1', validDto, admin as never);
    expect(result.versionNumber).toBe(1);
    expect(result.totalPercentage).toBe('100');
    expect(result.totalIs100).toBe(true);
    expect(result.lines).toHaveLength(3);
    expect(result.lines.every((item) => item.consumption === null && item.compensated === null && item.credit === null && item.balance === null)).toBe(true);
  });

  it('rejeita percentual negativo e > 100', async () => {
    const { service } = setup();
    await expect(service.create('plant-1', {
      ...validDto,
      lines: [line('uc-a', 'c-a', -1), line('uc-b', 'c-b', 50), line('uc-c', 'c-c', 51)],
    }, admin as never)).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.create('plant-1', {
      ...validDto,
      lines: [line('uc-a', 'c-a', 101)],
    }, admin as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejeita total diferente de 100', async () => {
    const { service } = setup();
    await expect(service.create('plant-1', {
      ...validDto,
      lines: [line('uc-a', 'c-a', 40), line('uc-b', 'c-b', 30), line('uc-c', 'c-c', 20)],
    }, admin as never)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('aceita soma decimal válida', async () => {
    const { service } = setup();
    const result = await service.create('plant-1', {
      ...validDto,
      lines: [line('uc-a', 'c-a', '33.33'), line('uc-b', 'c-b', '33.33'), line('uc-c', 'c-c', '33.34')],
    }, admin as never);
    expect(result.totalIs100).toBe(true);
  });

  it('rejeita vigência inválida', async () => {
    const { service } = setup();
    await expect(service.create('plant-1', {
      ...validDto,
      validFrom: '2026-07-01T00:00:00.000Z',
      validTo: '2026-01-01T00:00:00.000Z',
    }, admin as never)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejeita sobreposição e aceita versões consecutivas', async () => {
    const { service, createdVersions } = setup();
    const v1 = await service.create('plant-1', validDto, admin as never);
    expect(v1.label).toBe('V1');

    await expect(service.create('plant-1', {
      ...validDto,
      validFrom: '2026-06-15T00:00:00.000Z',
      validTo: '2026-12-31T00:00:00.000Z',
    }, admin as never)).rejects.toBeInstanceOf(ConflictException);

    const v2 = await service.newVersion('plant-1', v1.id, {
      validFrom: '2026-07-01T00:00:00.000Z',
      validTo: '2027-01-01T00:00:00.000Z',
      lines: [line('uc-a', 'c-a', 40), line('uc-b', 'c-b', 40), line('uc-c', 'c-c', 20)],
    }, admin as never);
    expect(v2.versionNumber).toBe(2);
    expect(createdVersions.find((item) => item.id === v1.id)?.validTo).toEqual(new Date('2026-07-01T00:00:00.000Z'));
  });

  it('histórico: março → V1; agosto → V2; V1 preservada', async () => {
    const { service, prisma, createdVersions } = setup();
    const v1 = await service.create('plant-1', validDto, admin as never);
    await service.newVersion('plant-1', v1.id, {
      validFrom: '2026-07-01T00:00:00.000Z',
      validTo: '2027-01-01T00:00:00.000Z',
      lines: [line('uc-a', 'c-a', 50), line('uc-b', 'c-b', 30), line('uc-c', 'c-c', 20)],
    }, admin as never);

    prisma.energyRateioVersion.findMany.mockImplementation(async ({ where }: {
      where: { validFrom: { lte: Date }; OR: Array<Record<string, unknown>>; status: string };
    }) => {
      const instant = where.validFrom.lte;
      return createdVersions.filter((item) => {
        if (item.status !== EnergyRateioVersionStatus.ACTIVE) return false;
        const from = item.validFrom as Date;
        const to = item.validTo as Date | null;
        return from <= instant && (to == null || to > instant);
      }).sort((a, b) => (b.validFrom as Date).getTime() - (a.validFrom as Date).getTime()).slice(0, 1);
    });

    const march = await service.current('plant-1', admin as never, '2026-03-15T12:00:00.000Z');
    const august = await service.current('plant-1', admin as never, '2026-08-15T12:00:00.000Z');
    expect(march.rateio?.versionNumber).toBe(1);
    expect(august.rateio?.versionNumber).toBe(2);
    expect(createdVersions.find((item) => item.versionNumber === 1)?.lines).toBeDefined();
    expect((createdVersions.find((item) => item.versionNumber === 1)?.lines as unknown[]).length).toBe(3);
  });

  it('ConsumerUnit deve pertencer ao Consumer', async () => {
    const { service } = setup();
    await expect(service.create('plant-1', {
      ...validDto,
      lines: [line('uc-a', 'c-b', 40), line('uc-b', 'c-b', 35), line('uc-c', 'c-c', 25)],
    }, admin as never)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('Plant inválida / fora de escopo', async () => {
    const { service } = setup();
    await expect(service.create('missing', validDto, admin as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.list('forbidden', admin as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('não transforma percentual em kWh e não calcula crédito/compensação/saldo', async () => {
    const { service } = setup();
    const result = await service.create('plant-1', validDto, admin as never);
    expect(JSON.stringify(result)).not.toMatch(/allocatedKwh|compensatedKwh|creditBalance|creditGenerated/);
    expect(result.lines[0].percentageUnit).toBe('%');
    expect(result.notes.some((note) => /Percentual não é kWh/i.test(note))).toBe(true);
  });

  it('geração ≠ rateio — domínio ENERGY_RATEIO', async () => {
    const { service } = setup();
    const listed = await service.list('plant-1', admin as never);
    expect(listed.domain).toBe('ENERGY_RATEIO');
    expect(listed).not.toHaveProperty('generation');
  });

  it('não expõe segredo', async () => {
    const { service } = setup();
    const result = await service.create('plant-1', validDto, admin as never);
    expect(JSON.stringify(result)).not.toMatch(/APP_SECRET|password|token/i);
  });
});

describe('Rateio API guards', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  const reflector = { getAllAndOverride: jest.fn() };

  function contextOf(user?: unknown) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ headers: {}, user }) }),
    } as unknown as ExecutionContext;
  }

  it('sem JWT', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const guard = new JwtAuthGuard(jwt, reflector as unknown as Reflector);
    expect(() => guard.canActivate(contextOf())).toThrow();
  });

  it('sem ENERGY_VIEW', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => (
      key === PERMISSIONS_KEY ? ['ENERGY_VIEW'] : undefined
    ));
    const guard = new PermissionsGuard(reflector as unknown as Reflector);
    expect(() => guard.canActivate(contextOf({ role: 'CUSTOMER' }))).toThrow(ForbiddenException);
  });

  it('sem ENERGY_UPDATE', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => (
      key === PERMISSIONS_KEY ? ['ENERGY_UPDATE'] : undefined
    ));
    const guard = new PermissionsGuard(reflector as unknown as Reflector);
    expect(() => guard.canActivate(contextOf({ role: 'TECNICO' }))).toThrow(ForbiddenException);
    expect(hasPermission('TECNICO', 'ENERGY_UPDATE')).toBe(false);
    expect(hasPermission('COMERCIAL', 'ENERGY_UPDATE')).toBe(true);
    expect(hasPermission('OPERADOR', 'ENERGY_UPDATE')).toBe(true);
  });
});
