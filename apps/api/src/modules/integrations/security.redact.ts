export const SENSITIVE_FIELD_KEY = /password|token|authorization|cookie|secret|credential|apikey|api[_-]?key/i;

export function omitSensitiveKeys(fields: Record<string, string | number | boolean | undefined>) {
  return Object.fromEntries(
    Object.entries(fields).filter(([key, value]) => value !== undefined && !SENSITIVE_FIELD_KEY.test(key)),
  );
}

function redactDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_FIELD_KEY.test(key)) continue;
    result[key] = redactDeep(item);
  }
  return result;
}

/** Remove campos sensíveis em qualquer profundidade. Não altera o objeto original. */
export function stripSensitiveObject(payload: unknown) {
  if (payload === undefined) return undefined;
  let clone: unknown;
  try {
    clone = JSON.parse(JSON.stringify(payload));
  } catch {
    return undefined;
  }
  return redactDeep(clone);
}
