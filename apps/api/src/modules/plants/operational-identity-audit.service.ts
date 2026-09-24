import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { resolveIntegrationExternalId } from '../integrations/integration-binding.identity';

export type OperationalIdentityAuditReport = {
  generatedAt: string;
  totals: {
    inverters: number;
    equipment: number;
    bindings: number;
    invertersWithoutManufacturer: number;
    invertersWithoutSerial: number;
    duplicateInverterSerials: number;
    gatewaysWithoutSerial: number;
    dataloggersWithoutSerial: number;
    gatewaysWithoutInverterLink: number;
    dataloggersWithoutInverterLink: number;
    bindingsWithoutExternalId: number;
    bindingsWithInvalidExternalId: number;
    bindingsExternalMetaWithoutProvider: number;
    bindingsWithOrphanInverter: number;
    duplicateExternalIdsSameProvider: number;
    auxsolInvertersWithoutBinding: number;
    auxsolGateways: number;
    auxsolGatewaysWithoutInverterLink: number;
  };
  items: {
    category: string;
    entityType: string;
    entityId: string;
    detail: string;
  }[];
};

/**
 * Auditoria read-only da identidade operacional.
 * Não corrige automaticamente e não inventa IDs externos.
 */
@Injectable()
export class OperationalIdentityAuditService {
  constructor(private prisma: PrismaService) {}

  async buildReport(): Promise<OperationalIdentityAuditReport> {
    const [inverters, equipment, bindings] = await Promise.all([
      this.prisma.inverter.findMany({
        include: {
          manufacturerRef: true,
          bindings: { select: { id: true, provider: true, externalId: true } },
          plant: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.equipment.findMany({
        include: { plant: { select: { id: true, name: true } }, inverter: { select: { id: true, serialNumber: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.integrationBinding.findMany({
        include: { inverter: { select: { id: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const items: OperationalIdentityAuditReport['items'] = [];
    const serialGroups = new Map<string, string[]>();

    for (const inverter of inverters) {
      if (!inverter.manufacturerId) {
        items.push({
          category: 'INVERTER_WITHOUT_MANUFACTURER',
          entityType: 'Inverter',
          entityId: inverter.id,
          detail: `${inverter.plant.name} · ${inverter.model || 'sem modelo'}`,
        });
      }
      if (!inverter.serialNumber?.trim()) {
        items.push({
          category: 'INVERTER_WITHOUT_SERIAL',
          entityType: 'Inverter',
          entityId: inverter.id,
          detail: `${inverter.plant.name} · ${inverter.model || 'sem modelo'}`,
        });
      } else {
        const key = `${inverter.plantId}::${inverter.serialNumber.trim().toUpperCase()}`;
        serialGroups.set(key, [...(serialGroups.get(key) ?? []), inverter.id]);
      }

      const manufacturerCode = (inverter.manufacturerRef?.code || inverter.manufacturer || '').toUpperCase();
      if (manufacturerCode === 'AUXSOL') {
        const hasBinding = inverter.bindings.some((binding) => binding.provider.toUpperCase() === 'AUXSOL');
        if (!hasBinding) {
          items.push({
            category: 'AUXSOL_INVERTER_WITHOUT_BINDING',
            entityType: 'Inverter',
            entityId: inverter.id,
            detail: `serial=${inverter.serialNumber || '—'} · plant=${inverter.plant.name}`,
          });
        }
      }
    }

    for (const [key, ids] of serialGroups) {
      if (ids.length > 1) {
        items.push({
          category: 'DUPLICATE_INVERTER_SERIAL',
          entityType: 'Inverter',
          entityId: ids.join(','),
          detail: key,
        });
      }
    }

    let auxsolGateways = 0;
    let auxsolGatewaysWithoutLink = 0;
    for (const item of equipment) {
      const serialMissing = !item.serialNumber?.trim();
      if (item.type === 'GATEWAY' && serialMissing) {
        items.push({
          category: 'GATEWAY_WITHOUT_SERIAL',
          entityType: 'Equipment',
          entityId: item.id,
          detail: item.plant.name,
        });
      }
      if (item.type === 'DATALOGGER' && serialMissing) {
        items.push({
          category: 'DATALOGGER_WITHOUT_SERIAL',
          entityType: 'Equipment',
          entityId: item.id,
          detail: item.plant.name,
        });
      }
      if (item.type === 'GATEWAY' && !item.inverterId) {
        items.push({
          category: 'GATEWAY_WITHOUT_INVERTER_LINK',
          entityType: 'Equipment',
          entityId: item.id,
          detail: `serial=${item.serialNumber} · plant=${item.plant.name}`,
        });
      }
      if (item.type === 'DATALOGGER' && !item.inverterId) {
        items.push({
          category: 'DATALOGGER_WITHOUT_INVERTER_LINK',
          entityType: 'Equipment',
          entityId: item.id,
          detail: `serial=${item.serialNumber} · plant=${item.plant.name}`,
        });
      }
      const isAuxsol = (item.manufacturerName || '').toUpperCase().includes('AUXSOL');
      if (item.type === 'GATEWAY' && isAuxsol) {
        auxsolGateways += 1;
        if (!item.inverterId) auxsolGatewaysWithoutLink += 1;
        items.push({
          category: item.inverterId ? 'AUXSOL_GATEWAY_LINKED' : 'AUXSOL_GATEWAY_WITHOUT_BINDING_CONTEXT',
          entityType: 'Equipment',
          entityId: item.id,
          detail: `serial=${item.serialNumber} · inverterId=${item.inverterId || 'não vinculado'}`,
        });
      }
    }

    let orphanBindings = 0;
    let bindingsWithoutExternal = 0;
    let bindingsWithInvalidExternal = 0;
    let bindingsMetaWithoutProvider = 0;
    const externalIdByProvider = new Map<string, string[]>();

    for (const binding of bindings) {
      const identity = resolveIntegrationExternalId({
        bindingExternalId: binding.externalId,
        inverterExternalId: null,
      });
      if (!identity.externalId) {
        bindingsWithoutExternal += 1;
        items.push({
          category: 'BINDING_WITHOUT_EXTERNAL_ID',
          entityType: 'IntegrationBinding',
          entityId: binding.id,
          detail: `provider=${binding.provider} · inverterId=${binding.inverterId}`,
        });
      } else if (!String(binding.externalId).trim() || String(binding.externalId).trim() !== identity.externalId) {
        bindingsWithInvalidExternal += 1;
        items.push({
          category: 'BINDING_INVALID_EXTERNAL_ID',
          entityType: 'IntegrationBinding',
          entityId: binding.id,
          detail: `provider=${binding.provider} · externalId inválido/whitespace`,
        });
      } else {
        const key = `${binding.provider.toUpperCase()}::${identity.externalId}`;
        externalIdByProvider.set(key, [...(externalIdByProvider.get(key) ?? []), binding.id]);
      }

      const meta = binding.externalMeta;
      const metaRecord = meta && typeof meta === 'object' && !Array.isArray(meta)
        ? meta as Record<string, unknown>
        : null;
      if (metaRecord && (typeof metaRecord.provider !== 'string' || !metaRecord.provider.trim())) {
        bindingsMetaWithoutProvider += 1;
        items.push({
          category: 'BINDING_EXTERNAL_META_WITHOUT_PROVIDER',
          entityType: 'IntegrationBinding',
          entityId: binding.id,
          detail: `provider=${binding.provider}`,
        });
      }

      if (!binding.inverter) {
        orphanBindings += 1;
        items.push({
          category: 'BINDING_ORPHAN_INVERTER',
          entityType: 'IntegrationBinding',
          entityId: binding.id,
          detail: `provider=${binding.provider}`,
        });
      }
    }

    for (const [key, ids] of externalIdByProvider) {
      if (ids.length > 1) {
        items.push({
          category: 'DUPLICATE_EXTERNAL_ID_SAME_PROVIDER',
          entityType: 'IntegrationBinding',
          entityId: ids.join(','),
          detail: key,
        });
      }
    }

    const count = (category: string) => items.filter((item) => item.category === category).length;

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        inverters: inverters.length,
        equipment: equipment.length,
        bindings: bindings.length,
        invertersWithoutManufacturer: count('INVERTER_WITHOUT_MANUFACTURER'),
        invertersWithoutSerial: count('INVERTER_WITHOUT_SERIAL'),
        duplicateInverterSerials: count('DUPLICATE_INVERTER_SERIAL'),
        gatewaysWithoutSerial: count('GATEWAY_WITHOUT_SERIAL'),
        dataloggersWithoutSerial: count('DATALOGGER_WITHOUT_SERIAL'),
        gatewaysWithoutInverterLink: count('GATEWAY_WITHOUT_INVERTER_LINK'),
        dataloggersWithoutInverterLink: count('DATALOGGER_WITHOUT_INVERTER_LINK'),
        bindingsWithoutExternalId: bindingsWithoutExternal,
        bindingsWithInvalidExternalId: bindingsWithInvalidExternal,
        bindingsExternalMetaWithoutProvider: bindingsMetaWithoutProvider,
        bindingsWithOrphanInverter: orphanBindings,
        duplicateExternalIdsSameProvider: count('DUPLICATE_EXTERNAL_ID_SAME_PROVIDER'),
        auxsolInvertersWithoutBinding: count('AUXSOL_INVERTER_WITHOUT_BINDING'),
        auxsolGateways,
        auxsolGatewaysWithoutInverterLink: auxsolGatewaysWithoutLink,
      },
      items,
    };
  }
}
