import {
  AuxsolDiscoveredInverter,
  AuxsolDiscoveredPlant,
  findTargetInverter,
  summarizeAuxsolInverters,
  summarizeAuxsolPlantPage,
} from '../auxsol/auxsol.discovery';
import { HttpAuxsolTransport } from '../auxsol/auxsol.transport';

const MAX_PAGES = 20;
const PAGE_SIZE = 100;

export type AuxsolInventoryEntry = {
  plant: AuxsolDiscoveredPlant;
  inverters: AuxsolDiscoveredInverter[];
};

/**
 * Inventário read-only AUXSOL para validação de identidade.
 * Não persiste. Não altera plantas/bindings reais.
 */
export async function loadAuxsolInventory(
  transport: Pick<HttpAuxsolTransport, 'listPlants' | 'getInvertersByPlant'>,
): Promise<AuxsolInventoryEntry[]> {
  const plants: AuxsolDiscoveredPlant[] = [];
  for (let current = 1; current <= MAX_PAGES; current += 1) {
    const payload = await transport.listPlants({ current, size: PAGE_SIZE });
    const page = summarizeAuxsolPlantPage(payload, PAGE_SIZE);
    plants.push(...page.plants);
    if (!page.hasMore) break;
  }

  const inventory: AuxsolInventoryEntry[] = [];
  for (const plant of plants) {
    if (plant.plantId === null) {
      inventory.push({ plant, inverters: [] });
      continue;
    }
    const payload = await transport.getInvertersByPlant(String(plant.plantId));
    const list = summarizeAuxsolInverters(payload, plant.plantId);
    inventory.push({ plant, inverters: list.inverters });
  }
  return inventory;
}

/**
 * Localiza equipamento por SN ou inverterId oficial no inventário já carregado.
 * Sem fallback para outro serial.
 */
export function findAuxsolIdentityInInventory(
  inventory: AuxsolInventoryEntry[],
  lookupKey: string,
) {
  const key = lookupKey.trim();
  if (!key) {
    return { found: false as const, observed: [] as Array<{ sn: string | null; model: unknown }> };
  }

  const bySn = findTargetInverter(inventory, key);
  if (bySn.found) return bySn;

  for (const entry of inventory) {
    for (const inverter of entry.inverters) {
      if (inverter.inverterId !== null && String(inverter.inverterId) === key) {
        return {
          found: true as const,
          plantId: entry.plant.plantId,
          plantName: entry.plant.plantName,
          inverterId: inverter.inverterId,
          sn: inverter.sn ?? key,
          model: inverter.model,
          gateway: inverter.gateway,
          identifiers: inverter.identifiers,
        };
      }
    }
  }

  return {
    found: false as const,
    observed: inventory.flatMap((entry) => entry.inverters.map((item) => ({
      sn: item.sn,
      model: item.model,
    }))),
  };
}
