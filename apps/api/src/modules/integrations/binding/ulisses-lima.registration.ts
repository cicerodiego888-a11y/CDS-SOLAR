/**
 * Sprint B7-ULISSES-01 — cadastro local idempotente da usina/inversor Ulisses Lima.
 * Sem chamadas mutáveis à AUXSOL. Sem persistência de telemetria.
 */
import { IntegrationBindingStatus, Prisma, type PrismaClient } from '@prisma/client';
import {
  buildAuxsolBindingExternalMeta,
  resolveAuxsolBindingExternalId,
} from '../auxsol/auxsol.discovery';
import { assertBindingPayloadHasNoSecrets } from '../integration-binding.identity';

export const ULISSES_LIMA_REGISTRATION = {
  customerName: 'Ulisses Lima',
  plantNameLocal: 'Ulisses Lima',
  plantNameExternal: 'ULISSESLIMA',
  installedPowerKw: 10,
  distributor: 'Equatorial',
  legacyConsumerUnit: '003005596601',
  historicalModelHint: 'ASL-10SL',
  confirmedModel: 'ASN-10SL',
  manufacturerCode: 'AUXSOL',
  inverterSerial: 'ASN-10SL251016000352',
  ratedPowerKw: 10,
  auxsolPlantId: 102545,
  auxsolInverterId: 1234568136545421,
  gatewaySerial: 'A012510191909021',
  /** Nome da variável de ambiente — nunca o valor do secret. */
  secretRefEnvName: 'AUXSOL_APP_SECRET',
} as const;

export type UlissesRegistrationReport = {
  sprint: 'B7-ULISSES-01';
  before: {
    customerId: string | null;
    plantId: string | null;
    inverterId: string | null;
    gatewayEquipmentId: string | null;
    bindingId: string | null;
    plantConsumerUnit: string | null;
    plantDistributor: string | null;
    otherCustomersCount: number;
  };
  reused: {
    customerId: string;
    plantId: string;
    manufacturerId: string;
    gatewayEquipmentId: string;
  };
  created: {
    inverter: boolean;
    binding: boolean;
  };
  associated: {
    inverterToPlant: boolean;
    gatewayToInverter: boolean;
  };
  identifiers: {
    local: {
      customerId: string;
      plantId: string;
      inverterId: string;
      gatewayEquipmentId: string;
      bindingId: string;
    };
    external: {
      provider: 'AUXSOL';
      plantId: number;
      inverterId: string;
      serialNumber: string;
      model: string;
      gatewaySerial: string;
    };
  };
  binding: {
    id: string;
    provider: string;
    inverterId: string;
    externalId: string | null;
    externalMeta: unknown;
    status: IntegrationBindingStatus;
    secretRef: string | null;
    containsSecretValue: boolean;
  };
  preservation: {
    customerUnchanged: boolean;
    plantUnchanged: boolean;
    legacyUcPreserved: boolean;
    distributorPreserved: boolean;
    historicalModelNote: string;
    otherCustomersUntouched: boolean;
  };
  auxsolRemoteMutations: false;
  telemetryPersisted: false;
};

type Tx = Prisma.TransactionClient | PrismaClient;

async function loadBefore(prisma: Tx) {
  const customer = await prisma.customer.findFirst({
    where: { name: { equals: ULISSES_LIMA_REGISTRATION.customerName, mode: 'insensitive' } },
    include: {
      plants: {
        where: { installedPowerKw: ULISSES_LIMA_REGISTRATION.installedPowerKw },
        include: {
          inverters: { where: { serialNumber: ULISSES_LIMA_REGISTRATION.inverterSerial } },
          equipment: { where: { serialNumber: ULISSES_LIMA_REGISTRATION.gatewaySerial } },
        },
      },
    },
  });
  const plant = customer?.plants[0] ?? null;
  const inverter = plant?.inverters[0] ?? null;
  const gateway = plant?.equipment[0] ?? null;
  const binding = inverter
    ? await prisma.integrationBinding.findUnique({
      where: {
        inverterId_provider: { inverterId: inverter.id, provider: 'AUXSOL' },
      },
    })
    : null;
  const otherCustomersCount = await prisma.customer.count({
    where: { NOT: { id: customer?.id ?? '__none__' } },
  });

  return {
    customer,
    plant,
    inverter,
    gateway,
    binding,
    snapshot: {
      customerId: customer?.id ?? null,
      plantId: plant?.id ?? null,
      inverterId: inverter?.id ?? null,
      gatewayEquipmentId: gateway?.id ?? null,
      bindingId: binding?.id ?? null,
      plantConsumerUnit: plant?.consumerUnit ?? null,
      plantDistributor: plant?.distributor ?? null,
      otherCustomersCount,
    },
  };
}

/**
 * Garante cadastro local + binding AUXSOL para Ulisses.
 * Idempotente. Não toca AUXSOL remoto. Não persiste leituras.
 */
export async function ensureUlissesLimaRegistration(prisma: PrismaClient): Promise<UlissesRegistrationReport> {
  const before = await loadBefore(prisma);
  if (!before.customer) {
    throw new Error('Customer Ulisses Lima não encontrado. Cadastro abortado (sem criar cliente).');
  }
  if (!before.plant) {
    throw new Error('Plant 10 kWp de Ulisses Lima não encontrada. Cadastro abortado (sem criar usina).');
  }
  if (before.plant.distributor !== ULISSES_LIMA_REGISTRATION.distributor) {
    throw new Error(
      `Distribuidora divergente (${before.plant.distributor}). Sem alteração automática — decisão cadastral necessária.`,
    );
  }

  const manufacturer = await prisma.inverterManufacturer.findUnique({
    where: { code: ULISSES_LIMA_REGISTRATION.manufacturerCode },
  });
  if (!manufacturer) {
    throw new Error('Fabricante AUXSOL ausente no catálogo oficial.');
  }

  const externalId = resolveAuxsolBindingExternalId({
    inverterId: ULISSES_LIMA_REGISTRATION.auxsolInverterId,
  });
  if (!externalId) {
    throw new Error('Contrato IntegrationBinding: inverterId externo ausente — gravação interrompida.');
  }

  const externalMeta = buildAuxsolBindingExternalMeta({
    plantId: ULISSES_LIMA_REGISTRATION.auxsolPlantId,
    inverterId: ULISSES_LIMA_REGISTRATION.auxsolInverterId,
    serialNumber: ULISSES_LIMA_REGISTRATION.inverterSerial,
    model: ULISSES_LIMA_REGISTRATION.confirmedModel,
    gatewayId: ULISSES_LIMA_REGISTRATION.gatewaySerial,
  });
  if (!externalMeta || !assertBindingPayloadHasNoSecrets(externalMeta)) {
    throw new Error('Contrato IntegrationBinding: externalMeta inválido — gravação interrompida.');
  }
  if (externalMeta.plantId == null || externalMeta.inverterId == null) {
    throw new Error(
      'Contrato IntegrationBinding: planta e inversor externos não identificados inequivocamente — gravação interrompida.',
    );
  }

  if (!before.gateway) {
    throw new Error(
      'Gateway A012510191909021 ausente na usina. Contrato Equipment exige avaliação antes de criar — criação automática bloqueada.',
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const snElsewhere = await tx.inverter.findFirst({
      where: {
        serialNumber: ULISSES_LIMA_REGISTRATION.inverterSerial,
        NOT: { plantId: before.plant!.id },
      },
    });
    if (snElsewhere) {
      throw new Error(
        `SN ${ULISSES_LIMA_REGISTRATION.inverterSerial} já existe em outra usina (${snElsewhere.plantId}). Duplicidade bloqueada.`,
      );
    }

    const conflictExternal = await tx.integrationBinding.findFirst({
      where: {
        provider: 'AUXSOL',
        externalId,
        ...(before.inverter ? { NOT: { inverterId: before.inverter.id } } : {}),
      },
    });
    if (conflictExternal && conflictExternal.inverterId !== before.inverter?.id) {
      throw new Error(
        `externalId AUXSOL ${externalId} já vinculado a outro inversor (${conflictExternal.inverterId}).`,
      );
    }

    let inverterCreated = false;
    let inverter = before.inverter;
    if (!inverter) {
      inverter = await tx.inverter.create({
        data: {
          plantId: before.plant!.id,
          manufacturerId: manufacturer.id,
          manufacturer: manufacturer.code,
          model: ULISSES_LIMA_REGISTRATION.confirmedModel,
          serialNumber: ULISSES_LIMA_REGISTRATION.inverterSerial,
          ratedPowerKw: ULISSES_LIMA_REGISTRATION.ratedPowerKw,
          status: 'ACTIVE',
        },
      });
      inverterCreated = true;
    } else {
      // Não sobrescreve histórico ASL se um dia existir; só garante fabricante/SN/associação.
      // Modelo confirmado da integração: ASN-10SL. Se model atual for ASL-10SL, preserva e anota.
      const shouldSetConfirmedModel = !inverter.model
        || inverter.model === ULISSES_LIMA_REGISTRATION.confirmedModel;
      if (
        inverter.manufacturerId !== manufacturer.id
        || inverter.serialNumber !== ULISSES_LIMA_REGISTRATION.inverterSerial
        || inverter.plantId !== before.plant!.id
        || (shouldSetConfirmedModel && inverter.model !== ULISSES_LIMA_REGISTRATION.confirmedModel)
      ) {
        inverter = await tx.inverter.update({
          where: { id: inverter.id },
          data: {
            plantId: before.plant!.id,
            manufacturerId: manufacturer.id,
            manufacturer: manufacturer.code,
            serialNumber: ULISSES_LIMA_REGISTRATION.inverterSerial,
            ...(shouldSetConfirmedModel
              ? { model: ULISSES_LIMA_REGISTRATION.confirmedModel }
              : {}),
            ratedPowerKw: ULISSES_LIMA_REGISTRATION.ratedPowerKw,
          },
        });
      }
    }

    const gatewayLinked = before.gateway!.inverterId === inverter.id;
    let gatewayToInverter = gatewayLinked;
    if (!gatewayLinked) {
      await tx.equipment.update({
        where: { id: before.gateway!.id },
        data: { inverterId: inverter.id },
      });
      gatewayToInverter = true;
    }

    const existingBinding = await tx.integrationBinding.findUnique({
      where: { inverterId_provider: { inverterId: inverter.id, provider: 'AUXSOL' } },
    });

    const bindingData = {
      provider: 'AUXSOL',
      manufacturerId: manufacturer.id,
      externalId,
      externalMeta: externalMeta as Prisma.InputJsonValue,
      status: IntegrationBindingStatus.READY,
      secretRef: ULISSES_LIMA_REGISTRATION.secretRefEnvName,
      lastErrorAt: null,
      lastErrorMessage: null,
    };

    let bindingCreated = false;
    const binding = existingBinding
      ? await tx.integrationBinding.update({
        where: { id: existingBinding.id },
        data: bindingData,
      })
      : await tx.integrationBinding.create({
        data: {
          inverterId: inverter.id,
          ...bindingData,
        },
      }).then((row) => {
        bindingCreated = true;
        return row;
      });

    // Isolamento: customer/plant não são atualizados nesta transação.
    const plantAfter = await tx.plant.findUnique({ where: { id: before.plant!.id } });
    const customerAfter = await tx.customer.findUnique({ where: { id: before.customer!.id } });
    const otherAfter = await tx.customer.count({
      where: { NOT: { id: before.customer!.id } },
    });

    return {
      inverter,
      binding,
      inverterCreated,
      bindingCreated,
      gatewayToInverter,
      plantAfter,
      customerAfter,
      otherAfter,
    };
  });

  const secretValue = process.env.AUXSOL_APP_SECRET?.trim() || '';
  const bindingDump = JSON.stringify({
    externalMeta: result.binding.externalMeta,
    secretRef: result.binding.secretRef,
  });

  return {
    sprint: 'B7-ULISSES-01',
    before: before.snapshot,
    reused: {
      customerId: before.customer.id,
      plantId: before.plant.id,
      manufacturerId: manufacturer.id,
      gatewayEquipmentId: before.gateway.id,
    },
    created: {
      inverter: result.inverterCreated,
      binding: result.bindingCreated,
    },
    associated: {
      inverterToPlant: result.inverter.plantId === before.plant.id,
      gatewayToInverter: result.gatewayToInverter,
    },
    identifiers: {
      local: {
        customerId: before.customer.id,
        plantId: before.plant.id,
        inverterId: result.inverter.id,
        gatewayEquipmentId: before.gateway.id,
        bindingId: result.binding.id,
      },
      external: {
        provider: 'AUXSOL',
        plantId: ULISSES_LIMA_REGISTRATION.auxsolPlantId,
        inverterId: externalId,
        serialNumber: ULISSES_LIMA_REGISTRATION.inverterSerial,
        model: ULISSES_LIMA_REGISTRATION.confirmedModel,
        gatewaySerial: ULISSES_LIMA_REGISTRATION.gatewaySerial,
      },
    },
    binding: {
      id: result.binding.id,
      provider: result.binding.provider,
      inverterId: result.binding.inverterId,
      externalId: result.binding.externalId,
      externalMeta: result.binding.externalMeta,
      status: result.binding.status,
      secretRef: result.binding.secretRef,
      containsSecretValue: Boolean(secretValue) && bindingDump.includes(secretValue),
    },
    preservation: {
      customerUnchanged: result.customerAfter?.updatedAt.getTime() === before.customer.updatedAt.getTime(),
      plantUnchanged: result.plantAfter?.updatedAt.getTime() === before.plant.updatedAt.getTime()
        && result.plantAfter?.consumerUnit === before.plant.consumerUnit
        && result.plantAfter?.distributor === before.plant.distributor,
      legacyUcPreserved: result.plantAfter?.consumerUnit === ULISSES_LIMA_REGISTRATION.legacyConsumerUnit,
      distributorPreserved: result.plantAfter?.distributor === ULISSES_LIMA_REGISTRATION.distributor,
      historicalModelNote:
        `Modelo confirmado da integração: ${ULISSES_LIMA_REGISTRATION.confirmedModel}. `
        + `Hint histórico ${ULISSES_LIMA_REGISTRATION.historicalModelHint} preservado como divergência documental `
        + '(não havia Inverter local com ASL-10SL para sobrescrever).',
      otherCustomersUntouched: result.otherAfter === before.snapshot.otherCustomersCount,
    },
    auxsolRemoteMutations: false,
    telemetryPersisted: false,
  };
}
