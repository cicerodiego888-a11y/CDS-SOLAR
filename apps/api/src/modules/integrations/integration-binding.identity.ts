/** Tipos de Equipment que podem se associar opcionalmente a um Inverter. */
export const INVERTER_LINKABLE_EQUIPMENT_TYPES = ['GATEWAY', 'DATALOGGER', 'INVERSOR'] as const;

export type InverterLinkableEquipmentType = (typeof INVERTER_LINKABLE_EQUIPMENT_TYPES)[number];

export function isInverterLinkableEquipmentType(type: string): type is InverterLinkableEquipmentType {
  return (INVERTER_LINKABLE_EQUIPMENT_TYPES as readonly string[]).includes(type);
}

/**
 * Identidade de integração: preferir IntegrationBinding.
 * Inverter.externalId é legado/opcional e não substitui o binding.
 */
export function resolveIntegrationExternalId(input: {
  bindingExternalId?: string | null;
  inverterExternalId?: string | null;
}) {
  const fromBinding = input.bindingExternalId?.trim() || null;
  if (fromBinding) return { source: 'binding' as const, externalId: fromBinding };
  const fromInverter = input.inverterExternalId?.trim() || null;
  if (fromInverter) return { source: 'inverter_legacy' as const, externalId: fromInverter };
  return { source: 'none' as const, externalId: null };
}

/** Garante que payload de binding não carregue secrets em claro. */
export function assertBindingPayloadHasNoSecrets(payload: Record<string, unknown>) {
  const forbidden = ['token', 'accessToken', 'apiKey', 'api_key', 'appSecret', 'APP_SECRET', 'password', 'secret'];
  const keys = Object.keys(payload);
  return !keys.some((key) => forbidden.includes(key) || forbidden.includes(key.toLowerCase()));
}

export function sanitizeBindingForLog<T extends Record<string, unknown>>(binding: T): Omit<T, 'secretRef'> & { secretRef?: undefined } {
  const clone = { ...binding };
  delete clone.secretRef;
  return clone as Omit<T, 'secretRef'> & { secretRef?: undefined };
}
