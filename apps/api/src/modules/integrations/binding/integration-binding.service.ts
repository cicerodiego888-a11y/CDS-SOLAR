import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IntegrationBindingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { JwtPayload } from '../../auth/auth.types';
import { AuthorizationService } from '../../auth/authorization.service';
import {
  buildAuxsolBindingExternalMeta,
  resolveAuxsolBindingExternalId,
} from '../auxsol/auxsol.discovery';
import { createAuxsolTransport, HttpAuxsolTransport } from '../auxsol/auxsol.transport';
import {
  assertBindingPayloadHasNoSecrets,
} from '../integration-binding.identity';
import { findAuxsolIdentityInInventory, loadAuxsolInventory } from './auxsol-identity.lookup';

export type ValidateBindingDto = {
  lookupKey: string;
};

export type CreateBindingDto = {
  /** Chave informada na validação (SN ou ID oficial). Create sempre revalida. */
  lookupKey: string;
};

function manufacturerCodeOf(inverter: {
  manufacturer: string;
  manufacturerRef?: { code: string } | null;
}) {
  return (inverter.manufacturerRef?.code || inverter.manufacturer || '').trim().toUpperCase();
}

function publicBinding(binding: {
  id: string;
  provider: string;
  inverterId: string;
  externalId: string | null;
  externalMeta: unknown;
  status: IntegrationBindingStatus;
  lastSyncAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  manufacturerId?: string | null;
}) {
  return {
    id: binding.id,
    provider: binding.provider,
    inverterId: binding.inverterId,
    manufacturerId: binding.manufacturerId ?? null,
    externalId: binding.externalId,
    externalMeta: binding.externalMeta,
    status: binding.status,
    lastSyncAt: binding.lastSyncAt,
    lastErrorAt: binding.lastErrorAt,
    lastErrorMessage: binding.lastErrorMessage,
    createdAt: binding.createdAt,
    updatedAt: binding.updatedAt,
  };
}

@Injectable()
export class IntegrationBindingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async get(inverterId: string, user: JwtPayload) {
    const inverter = await this.assertInverterAccess(inverterId, user);
    const provider = manufacturerCodeOf(inverter) || 'UNKNOWN';
    const binding = await this.prisma.integrationBinding.findUnique({
      where: { inverterId_provider: { inverterId, provider } },
    }) ?? await this.prisma.integrationBinding.findFirst({
      where: { inverterId },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      inverterId,
      manufacturer: manufacturerCodeOf(inverter) || null,
      serialNumber: inverter.serialNumber,
      model: inverter.model,
      binding: binding ? publicBinding(binding) : null,
      configured: Boolean(binding?.externalId),
    };
  }

  async validate(inverterId: string, dto: ValidateBindingDto, user: JwtPayload) {
    const inverter = await this.assertInverterAccess(inverterId, user);
    const manufacturer = manufacturerCodeOf(inverter);
    const lookupKey = dto.lookupKey?.trim() || '';
    if (!lookupKey) {
      throw new BadRequestException('Informe a identidade externa a validar.');
    }

    if (manufacturer !== 'AUXSOL') {
      return {
        found: false,
        code: 'MANUFACTURER_NOT_SUPPORTED',
        message: 'A validação automática ainda não está disponível para este fabricante.',
        manufacturer: manufacturer || null,
        technical: { manufacturer },
      };
    }

    return this.validateAuxsol(inverter, lookupKey);
  }

  async create(inverterId: string, dto: CreateBindingDto, user: JwtPayload) {
    const inverter = await this.assertInverterAccess(inverterId, user);
    const manufacturer = manufacturerCodeOf(inverter);
    const lookupKey = dto.lookupKey?.trim() || '';
    if (!lookupKey) {
      throw new BadRequestException('Informe a identidade validada (lookupKey).');
    }
    if (manufacturer !== 'AUXSOL') {
      throw new BadRequestException('Não é possível criar vínculo para este fabricante no momento.');
    }

    const validation = await this.validateAuxsol(inverter, lookupKey);
    if (!validation.found || !validation.identity?.externalId) {
      throw new BadRequestException(
        validation.message || 'Nenhum equipamento correspondente foi encontrado no escopo autorizado do fabricante.',
      );
    }

    const externalId = validation.identity.externalId;
    const externalMeta = validation.identity.externalMeta;
    if (!externalMeta || !assertBindingPayloadHasNoSecrets(externalMeta as Record<string, unknown>)) {
      throw new BadRequestException('Metadados externos inválidos para o vínculo.');
    }

    const conflict = await this.prisma.integrationBinding.findFirst({
      where: {
        provider: 'AUXSOL',
        externalId,
        NOT: { inverterId },
      },
      include: { inverter: { select: { id: true, serialNumber: true, plantId: true } } },
    });
    if (conflict) {
      throw new ConflictException(
        'Esta identidade externa já está vinculada a outro inversor. Remova o vínculo anterior antes de continuar.',
      );
    }

    const existing = await this.prisma.integrationBinding.findUnique({
      where: { inverterId_provider: { inverterId, provider: 'AUXSOL' } },
    });

    const data = {
      provider: 'AUXSOL',
      manufacturerId: inverter.manufacturerId,
      externalId,
      externalMeta: {
        ...(externalMeta as Record<string, unknown>),
        validatedAt: new Date().toISOString(),
        lookupKey,
      } as Prisma.InputJsonValue,
      status: IntegrationBindingStatus.READY,
      lastErrorAt: null,
      lastErrorMessage: null,
    };

    const binding = existing
      ? await this.prisma.integrationBinding.update({
        where: { id: existing.id },
        data,
      })
      : await this.prisma.integrationBinding.create({
        data: {
          inverterId,
          ...data,
        },
      });

    return {
      ok: true,
      message: 'Integração configurada.',
      binding: publicBinding(binding),
      identity: validation.identity,
    };
  }

  async remove(inverterId: string, user: JwtPayload) {
    const inverter = await this.assertInverterAccess(inverterId, user);
    const manufacturer = manufacturerCodeOf(inverter);
    const binding = manufacturer
      ? await this.prisma.integrationBinding.findUnique({
        where: { inverterId_provider: { inverterId, provider: manufacturer } },
      })
      : null;
    const target = binding ?? await this.prisma.integrationBinding.findFirst({ where: { inverterId } });
    if (!target) {
      throw new NotFoundException('Não há vínculo de integração para este inversor.');
    }
    await this.prisma.integrationBinding.delete({ where: { id: target.id } });
    return { ok: true, message: 'Vínculo removido.', inverterId, provider: target.provider };
  }

  private async validateAuxsol(
    inverter: {
      id: string;
      serialNumber: string | null;
      model: string | null;
      manufacturerId: string | null;
      plantId: string;
    },
    lookupKey: string,
  ) {
    const transport = createAuxsolTransport();
    if (transport.mode !== 'live') {
      return {
        found: false,
        code: 'MANUFACTURER_UNAVAILABLE',
        message: 'A integração AUXSOL não está disponível em modo live para validação.',
        manufacturer: 'AUXSOL' as const,
        technical: { mode: transport.mode },
      };
    }

    let inventory;
    try {
      inventory = await loadAuxsolInventory(transport as HttpAuxsolTransport);
    } catch (error) {
      return {
        found: false,
        code: 'VALIDATION_FAILED',
        message: 'Não foi possível consultar o fabricante neste momento.',
        manufacturer: 'AUXSOL' as const,
        technical: {
          errorName: error instanceof Error ? error.name : 'unknown',
        },
      };
    }

    const match = findAuxsolIdentityInInventory(inventory, lookupKey);
    if (!match.found) {
      return {
        found: false,
        code: 'TARGET_NOT_FOUND',
        message: 'Nenhum equipamento correspondente foi encontrado no escopo autorizado do fabricante.',
        manufacturer: 'AUXSOL' as const,
        technical: { lookupKey, observedCount: match.observed.length },
      };
    }

    const externalId = resolveAuxsolBindingExternalId({ inverterId: match.inverterId });
    if (!externalId) {
      return {
        found: false,
        code: 'PROVIDER_INVERTER_ID_ABSENT',
        message: 'O fabricante localizou o equipamento, mas não retornou identidade oficial suficiente para o vínculo.',
        manufacturer: 'AUXSOL' as const,
        technical: { sn: match.sn },
      };
    }

    // Coerência opcional: se o B7 tem serial e o fabricante retornou SN diferente, bloquear.
    if (inverter.serialNumber && match.sn && inverter.serialNumber !== match.sn) {
      throw new ConflictException(
        'O serial local do inversor não corresponde ao serial retornado pelo fabricante para esta identidade.',
      );
    }

    const externalMeta = buildAuxsolBindingExternalMeta({
      plantId: match.plantId,
      inverterId: match.inverterId,
      serialNumber: match.sn,
      model: match.model,
      gatewayId: match.gateway,
    });

    return {
      found: true,
      code: 'IDENTITY_FOUND',
      message: 'Identidade encontrada no fabricante.',
      manufacturer: 'AUXSOL' as const,
      identity: {
        externalId,
        serialNumber: match.sn,
        model: typeof match.model === 'string' || match.model == null ? match.model : String(match.model),
        plantId: match.plantId,
        inverterId: match.inverterId,
        gateway: match.gateway ?? null,
        plantName: match.plantName,
        externalMeta,
      },
    };
  }

  private async assertInverterAccess(inverterId: string, user: JwtPayload) {
    const inverter = await this.prisma.inverter.findUnique({
      where: { id: inverterId },
      include: {
        plant: { select: { id: true, customerId: true, name: true } },
        manufacturerRef: true,
      },
    });
    if (!inverter) throw new NotFoundException('Inversor não encontrado.');
    try {
      await this.authorization.assertPlantAccess(user, inverter.plant);
    } catch {
      throw new ForbiddenException('Acesso negado a este inversor.');
    }
    return inverter;
  }
}
