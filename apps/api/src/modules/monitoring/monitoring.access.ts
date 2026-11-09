import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../auth/authorization.service';
import { JwtPayload } from '../auth/auth.types';

/**
 * Acesso a recursos de monitoramento.
 * Delega resolução de escopo ao AuthorizationService (Role ≠ Scope).
 * Mantém customerScope() para compatibilidade com listagens legadas.
 */
@Injectable()
export class MonitoringAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  /**
   * Compatibilidade:
   * - staff → null (sem filtro)
   * - escopo customer-wide único sem plants → customerId
   * - demais escopos → usa buildPlantWhere via callers atualizados; aqui retorna null
   *   apenas se unrestricted; caso contrário deriva filtro seguro.
   *
   * Preferir `buildPlantWhere` em listagens novas.
   */
  async customerScope(user: JwtPayload): Promise<string | null> {
    const scope = await this.authorization.resolveAccessScope(user);
    if (scope.unrestricted) return null;
    if (!scope.customerWideIds.length && !scope.plantIds.length) {
      throw new ForbiddenException('Acesso negado');
    }
    // Legado CUSTOMER / grant customer-wide único
    if (scope.customerWideIds.length === 1 && scope.plantIds.length === 0) {
      return scope.customerWideIds[0];
    }
    // Escopo multi/plant: callers devem usar buildPlantWhere.
    // Para não abrir acesso total, sinalizamos via exceção se alguém depender só de customerScope
    // em contexto plant-only sem customer-wide.
    if (scope.customerWideIds.length === 0 && scope.plantIds.length > 0) {
      // Retorna null seria unrestricted — incorreto.
      // Usamos o customer derivado da primeira planta apenas para filtros customerId legados
      // quando o serviço ainda não migrou; plant assert continua correto via canAccessPlant.
      const plant = await this.prisma.plant.findFirst({
        where: { id: { in: scope.plantIds } },
        select: { customerId: true },
      });
      if (!plant) throw new ForbiddenException('Acesso negado');
      return plant.customerId;
    }
    if (scope.customerWideIds.length >= 1) {
      return scope.customerWideIds[0];
    }
    throw new ForbiddenException('Acesso negado');
  }

  async buildPlantWhere(user: JwtPayload): Promise<Prisma.PlantWhereInput | undefined> {
    return this.authorization.buildPlantWhere(user);
  }

  async assertPlant(id: string, user: JwtPayload) {
    const plant = await this.prisma.plant.findUnique({
      where: { id },
      include: {
        customer: true,
        inverters: {
          include: {
            manufacturerRef: true,
            bindings: true,
          },
        },
      },
    });
    if (!plant) throw new NotFoundException('Usina não encontrada.');
    await this.authorization.assertPlantAccess(user, plant);
    return plant;
  }

  async assertInverter(id: string, user: JwtPayload) {
    const inverter = await this.prisma.inverter.findUnique({
      where: { id },
      include: {
        plant: { include: { customer: true } },
        bindings: true,
        manufacturerRef: true,
      },
    });
    if (!inverter) throw new NotFoundException('Inversor não encontrado.');
    await this.authorization.assertPlantAccess(user, inverter.plant);
    return inverter;
  }
}
