/**
 * Rótulos de apresentação (pt-BR) para estados de monitoramento.
 * Não altera valores internos, normalização operacional nem persistência.
 */

export const UNAVAILABLE_LABEL = 'Não disponível';
export const UNIDENTIFIED_LABEL = 'Não identificado';

/** Status normalizado / observado / operacional do equipamento. */
export const NORMALIZED_STATUS_LABELS = {
  ONLINE: 'Online',
  OFFLINE: 'Offline',
  WARNING: 'Em atenção',
  ERROR: 'Com erro',
  UNKNOWN: 'Não identificado',
} as const;

export type NormalizedStatusKey = keyof typeof NORMALIZED_STATUS_LABELS;

/** Saúde operacional / diagnóstico agregado. */
export const OPERATIONAL_HEALTH_LABELS = {
  HEALTHY: 'Saudável',
  ATTENTION: 'Atenção',
  CRITICAL: 'Crítico',
  NO_DATA: 'Sem dados',
} as const;

/** Status do diagnóstico operacional. */
export const DIAGNOSIS_STATUS_LABELS = {
  ACTIVE: 'Ativo',
  ATTENTION: 'Atenção',
  NO_DATA: 'Sem dados',
} as const;

/** Motivos de disponibilidade (apresentação). */
export const AVAILABILITY_REASON_LABELS = {
  OK: 'Ok',
  NO_DATA: 'Sem dados',
  INTEGRATION_BLOCKED: 'Integração bloqueada',
  INTEGRATION_NOT_CONFIGURED: 'Integração não configurada',
  NOT_SUPPORTED: 'Não suportado',
  INACTIVE: 'Inativo',
  NO_ELIGIBLE_INVERTERS: 'Sem inversores elegíveis',
  LIVE_OBSERVATION: 'Observação ao vivo',
} as const;

/** Severidade de alerta / diagnóstico. */
export const ALERT_SEVERITY_LABELS_PT = {
  INFO: 'Informação',
  WARNING: 'Em atenção',
  CRITICAL: 'Crítico',
} as const;

/** Ciclo de vida do alerta. */
export const ALERT_STATUS_LABELS_PT = {
  OPEN: 'Aberto',
  ACKNOWLEDGED: 'Reconhecido',
  RESOLVED: 'Resolvido',
} as const;

/** Tipos de evento da timeline de diagnóstico. */
export const DIAGNOSIS_TIMELINE_TYPE_LABELS = {
  READ: 'Leitura',
  ALERT_OPENED: 'Alerta aberto',
  ALERT_ACKNOWLEDGED: 'Alerta reconhecido',
  ALERT_RESOLVED: 'Alerta resolvido',
} as const;

const KNOWN_NORMALIZED = new Set<string>(Object.keys(NORMALIZED_STATUS_LABELS));

function normalizeToken(value?: string | null): string {
  return String(value ?? '').trim().toUpperCase();
}

/** Ausência de dado → Não disponível (não confundir com falha de comunicação). */
export function unavailableLabel(value?: string | null): string {
  if (value == null || String(value).trim() === '' || String(value).trim().toUpperCase() === 'N/D') {
    return UNAVAILABLE_LABEL;
  }
  return String(value);
}

export function isKnownNormalizedStatus(value?: string | null): boolean {
  const token = normalizeToken(value);
  return KNOWN_NORMALIZED.has(token);
}

/**
 * Status normalizado / observado do equipamento.
 * Valores desconhecidos recebem fallback pt-BR sem virar ONLINE/OFFLINE/WARNING.
 */
export function normalizedStatusLabel(value?: string | null): string {
  if (value == null || String(value).trim() === '') return UNAVAILABLE_LABEL;
  const token = normalizeToken(value);
  if (token === 'N/D') return UNAVAILABLE_LABEL;
  if (token in NORMALIZED_STATUS_LABELS) {
    return NORMALIZED_STATUS_LABELS[token as NormalizedStatusKey];
  }
  return UNIDENTIFIED_LABEL;
}

/** Alias semântico para status observado na disponibilidade. */
export function observedStatusLabel(value?: string | null): string {
  return normalizedStatusLabel(value);
}

export function operationalHealthLabel(value?: string | null): string {
  if (value == null || String(value).trim() === '') return OPERATIONAL_HEALTH_LABELS.NO_DATA;
  const token = normalizeToken(value);
  if (token in OPERATIONAL_HEALTH_LABELS) {
    return OPERATIONAL_HEALTH_LABELS[token as keyof typeof OPERATIONAL_HEALTH_LABELS];
  }
  return UNIDENTIFIED_LABEL;
}

export function diagnosisStatusLabel(value?: string | null): string {
  if (value == null || String(value).trim() === '') return DIAGNOSIS_STATUS_LABELS.NO_DATA;
  const token = normalizeToken(value);
  if (token in DIAGNOSIS_STATUS_LABELS) {
    return DIAGNOSIS_STATUS_LABELS[token as keyof typeof DIAGNOSIS_STATUS_LABELS];
  }
  // HEALTHY/CRITICAL podem aparecer no badge agregado da usina
  if (token in OPERATIONAL_HEALTH_LABELS) {
    return OPERATIONAL_HEALTH_LABELS[token as keyof typeof OPERATIONAL_HEALTH_LABELS];
  }
  return UNIDENTIFIED_LABEL;
}

export function availabilityReasonLabel(value?: string | null): string {
  if (value == null || String(value).trim() === '') return UNAVAILABLE_LABEL;
  const token = normalizeToken(value);
  if (token in AVAILABILITY_REASON_LABELS) {
    return AVAILABILITY_REASON_LABELS[token as keyof typeof AVAILABILITY_REASON_LABELS];
  }
  return UNIDENTIFIED_LABEL;
}

export function alertSeverityLabel(value?: string | null): string {
  if (value == null || String(value).trim() === '') return ALERT_SEVERITY_LABELS_PT.INFO;
  const token = normalizeToken(value);
  if (token in ALERT_SEVERITY_LABELS_PT) {
    return ALERT_SEVERITY_LABELS_PT[token as keyof typeof ALERT_SEVERITY_LABELS_PT];
  }
  return UNIDENTIFIED_LABEL;
}

export function alertLifecycleLabel(value?: string | null): string {
  if (value == null || String(value).trim() === '') return ALERT_STATUS_LABELS_PT.OPEN;
  const token = normalizeToken(value);
  if (token in ALERT_STATUS_LABELS_PT) {
    return ALERT_STATUS_LABELS_PT[token as keyof typeof ALERT_STATUS_LABELS_PT];
  }
  return UNIDENTIFIED_LABEL;
}

export function diagnosisTimelineStatusLabel(status?: string | null, type?: string | null): string {
  if (status != null && String(status).trim() !== '') {
    const token = normalizeToken(status);
    if (token in NORMALIZED_STATUS_LABELS) {
      return NORMALIZED_STATUS_LABELS[token as NormalizedStatusKey];
    }
    if (token in ALERT_STATUS_LABELS_PT) {
      return ALERT_STATUS_LABELS_PT[token as keyof typeof ALERT_STATUS_LABELS_PT];
    }
    if (token in DIAGNOSIS_TIMELINE_TYPE_LABELS) {
      return DIAGNOSIS_TIMELINE_TYPE_LABELS[token as keyof typeof DIAGNOSIS_TIMELINE_TYPE_LABELS];
    }
  }
  if (type != null && String(type).trim() !== '') {
    const token = normalizeToken(type);
    if (token in DIAGNOSIS_TIMELINE_TYPE_LABELS) {
      return DIAGNOSIS_TIMELINE_TYPE_LABELS[token as keyof typeof DIAGNOSIS_TIMELINE_TYPE_LABELS];
    }
  }
  if ((status == null || String(status).trim() === '') && (type == null || String(type).trim() === '')) {
    return UNAVAILABLE_LABEL;
  }
  return UNIDENTIFIED_LABEL;
}

/**
 * Estado do equipamento na UI: prioriza status normalizado.
 * Código bruto do fabricante (ex.: "1") não é inventado como ONLINE/OFFLINE.
 */
export function equipmentStatusLabel(
  normalizedStatus?: string | null,
  rawEquipmentStatus?: string | null,
): string {
  if (normalizedStatus != null && String(normalizedStatus).trim() !== '') {
    return normalizedStatusLabel(normalizedStatus);
  }
  if (rawEquipmentStatus != null && String(rawEquipmentStatus).trim() !== '') {
    const token = normalizeToken(rawEquipmentStatus);
    if (token in NORMALIZED_STATUS_LABELS) {
      return NORMALIZED_STATUS_LABELS[token as NormalizedStatusKey];
    }
    return UNIDENTIFIED_LABEL;
  }
  return UNAVAILABLE_LABEL;
}
