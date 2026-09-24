import { BadRequestException } from '@nestjs/common';

/** Normaliza número de UC / Conta Contrato removendo máscara. */
export function normalizeUtilityNumber(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

export function assertUtilityNumber(value: string | null | undefined, label: string) {
  const digits = normalizeUtilityNumber(value);
  if (!digits) {
    throw new BadRequestException(`Informe ${label}.`);
  }
  if (!/^\d+$/.test(digits)) {
    throw new BadRequestException(`${label} contém caracteres inválidos.`);
  }
  return digits;
}

/** Conta Contrato é opcional; se informada, normaliza e valida. */
export function optionalContractAccount(value: string | null | undefined) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return assertUtilityNumber(trimmed, 'a Conta Contrato');
}
