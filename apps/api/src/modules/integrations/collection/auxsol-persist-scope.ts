/**
 * Escopo controlado de persistência AUXSOL (B7-MONITORING-PERSISTENCE-01).
 * AUXSOL_PERSIST_READINGS=true sozinho NÃO grava para todos os inversores.
 * Exige allowlist explícita em AUXSOL_PERSIST_INVERTER_IDS (csv de inverterId).
 */

export function parseAuxsolPersistInverterIds(
  raw: string | undefined = process.env.AUXSOL_PERSIST_INVERTER_IDS,
): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(',').map((item) => item.trim()).filter(Boolean))];
}

export function isAuxsolPersistReadingsEnabled(
  value: string | undefined = process.env.AUXSOL_PERSIST_READINGS,
): boolean {
  return value === 'true';
}

/** Persistência efetiva para um inversor AUXSOL. */
export function isAuxsolInverterPersistAllowed(inverterId: string): boolean {
  if (!isAuxsolPersistReadingsEnabled()) return false;
  const id = inverterId?.trim();
  if (!id) return false;
  const allowlist = parseAuxsolPersistInverterIds();
  if (!allowlist.length) return false;
  return allowlist.includes(id);
}

/**
 * Decide se a coleta deve gravar MonitoringReading.
 * AUXSOL: flag global + allowlist. Demais providers: respeitam runtime.persistable.
 */
export function isReadingPersistAllowed(input: {
  provider: string;
  inverterId: string;
  runtimePersistable: boolean;
}): boolean {
  if (!input.runtimePersistable) return false;
  if (input.provider === 'AUXSOL') {
    return isAuxsolInverterPersistAllowed(input.inverterId);
  }
  return true;
}
