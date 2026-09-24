import { BadRequestException } from '@nestjs/common';

export const DOCUMENT_IN_USE_MESSAGE = 'Este documento já está sendo utilizado.';

export function normalizeDocument(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

export function isValidCpf(digits: string) {
  if (!/^\d{11}$/.test(digits)) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

export function isValidCnpj(digits: string) {
  if (!/^\d{14}$/.test(digits)) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const check = (length: number) => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * weights[index];
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  return check(12) === Number(digits[12]) && check(13) === Number(digits[13]);
}

export function assertEnergyDocument(
  document: string | null | undefined,
  documentType: string | null | undefined,
): { document: string; documentType: 'CPF' | 'CNPJ' } {
  const digits = normalizeDocument(document);
  if (!digits) {
    throw new BadRequestException('Informe o documento.');
  }
  if (documentType !== 'CPF' && documentType !== 'CNPJ') {
    throw new BadRequestException('Tipo de documento inválido.');
  }
  const type: 'CPF' | 'CNPJ' = documentType === 'CNPJ' ? 'CNPJ' : 'CPF';
  if (type === 'CPF' && digits.length !== 11) {
    throw new BadRequestException('O tipo de documento não corresponde ao formato informado.');
  }
  if (type === 'CNPJ' && digits.length !== 14) {
    throw new BadRequestException('O tipo de documento não corresponde ao formato informado.');
  }
  if (type === 'CPF' && !isValidCpf(digits)) {
    throw new BadRequestException('CPF inválido.');
  }
  if (type === 'CNPJ' && !isValidCnpj(digits)) {
    throw new BadRequestException('CNPJ inválido.');
  }
  return { document: digits, documentType: type };
}
