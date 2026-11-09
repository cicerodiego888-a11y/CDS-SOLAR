export type ConsumerUnitCard = {
  id: string;
  number: string;
  contractAccount?: string | null;
  status: string;
  distributor?: { id: string; name: string; code?: string } | null;
};

export type PlantEnergyFormState = {
  customerId: string;
  consumerUnitId: string;
  distributor: string;
  consumerUnit: string;
};

export function normalizeUtilityInput(value: string) {
  return value.replace(/\D/g, '');
}

export function validateConsumerUnitForm(form: {
  distributorId: string;
  number: string;
  contractAccount: string;
}) {
  const errors: { distributorId?: string; number?: string; contractAccount?: string } = {};
  if (!form.distributorId) errors.distributorId = 'Selecione a distribuidora.';
  if (!normalizeUtilityInput(form.number)) errors.number = 'Informe o número da unidade consumidora.';
  if (form.contractAccount.trim() && !normalizeUtilityInput(form.contractAccount)) {
    errors.contractAccount = 'Conta Contrato inválida.';
  }
  return errors;
}

export function buildConsumerUnitPayload(form: {
  distributorId: string;
  number: string;
  contractAccount: string;
  address?: string;
  status?: string;
}) {
  return {
    distributorId: form.distributorId,
    number: normalizeUtilityInput(form.number),
    contractAccount: form.contractAccount.trim()
      ? normalizeUtilityInput(form.contractAccount)
      : undefined,
    ...(form.address !== undefined ? { address: form.address.trim() || null } : {}),
    ...(form.status ? { status: form.status } : {}),
  };
}

export function consumerUnitLabel(unit: ConsumerUnitCard) {
  const distributor = unit.distributor?.name || 'Distribuidora não informada';
  return `${unit.number} — ${distributor}`;
}

export function plantDistributorDisplay(plant: {
  consumerUnitRef?: { distributor?: { name?: string } | null } | null;
  distributor?: string | null;
}) {
  return plant.consumerUnitRef?.distributor?.name || plant.distributor || '—';
}

export function plantConsumerUnitDisplay(plant: {
  consumerUnitRef?: { number?: string } | null;
  consumerUnit?: string | null;
}) {
  return plant.consumerUnitRef?.number || plant.consumerUnit || '—';
}

export function filterUnitsForCustomerConsumer(
  units: ConsumerUnitCard[],
  consumerId: string | null | undefined,
) {
  if (!consumerId) return [];
  return units.filter((unit) => (unit as ConsumerUnitCard & { consumerId?: string }).consumerId === consumerId
    || !(unit as { consumerId?: string }).consumerId);
}

export function applyPlantUnitSelection(
  state: PlantEnergyFormState,
  unit: ConsumerUnitCard | null,
): PlantEnergyFormState {
  if (!unit) {
    return { ...state, consumerUnitId: '', distributor: '', consumerUnit: '' };
  }
  return {
    ...state,
    consumerUnitId: unit.id,
    distributor: unit.distributor?.name || '',
    consumerUnit: unit.number,
  };
}

export function otherConsumerUnitMessage() {
  return 'Esta unidade consumidora pertence a outro consumidor e não pode ser vinculada a esta usina.';
}

/** Enquanto as UCs do cliente não chegaram, não exibir os campos legados editáveis. */
export function plantEnergyFieldMode(unitsLoaded: boolean, unitCount: number): 'loading' | 'formal' | 'legacy' {
  if (!unitsLoaded) return 'loading';
  return unitCount > 0 ? 'formal' : 'legacy';
}
