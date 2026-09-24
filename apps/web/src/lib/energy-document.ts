export type EnergyDocumentType = 'CPF' | 'CNPJ';

export type EnergyFieldErrors = {
  documentType?: string;
  document?: string;
  name?: string;
  email?: string;
};

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

export function maskDocumentInput(value: string, documentType: EnergyDocumentType) {
  const digits = normalizeDocument(value).slice(0, documentType === 'CPF' ? 11 : 14);
  if (documentType === 'CPF') {
    const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9), digits.slice(9, 11)];
    let masked = parts[0] ?? '';
    if (digits.length > 3) masked += `.${parts[1]}`;
    if (digits.length > 6) masked += `.${parts[2]}`;
    if (digits.length > 9) masked += `-${parts[3]}`;
    return masked;
  }
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 8), digits.slice(8, 12), digits.slice(12, 14)];
  let masked = parts[0] ?? '';
  if (digits.length > 2) masked += `.${parts[1]}`;
  if (digits.length > 5) masked += `.${parts[2]}`;
  if (digits.length > 8) masked += `/${parts[3]}`;
  if (digits.length > 12) masked += `-${parts[4]}`;
  return masked;
}

export function concealDocument(value: string) {
  const digits = normalizeDocument(value);
  if (digits.length < 2) return '***...';
  return `***...${digits.slice(-2)}`;
}

export function energyDocumentError(document: string, documentType: string) {
  const digits = normalizeDocument(document);
  if (!digits) return 'Informe o documento.';
  if (documentType !== 'CPF' && documentType !== 'CNPJ') return 'Informe o tipo de documento.';
  if (documentType === 'CPF' && digits.length !== 11) return 'O tipo de documento não corresponde ao formato informado.';
  if (documentType === 'CNPJ' && digits.length !== 14) return 'O tipo de documento não corresponde ao formato informado.';
  if (documentType === 'CPF' && !isValidCpf(digits)) return 'CPF inválido.';
  if (documentType === 'CNPJ' && !isValidCnpj(digits)) return 'CNPJ inválido.';
  return null;
}

export function validateEnergyForm(form: {
  documentType: string;
  document: string;
  name: string;
  email: string;
}): EnergyFieldErrors {
  const errors: EnergyFieldErrors = {};
  if (form.documentType !== 'CPF' && form.documentType !== 'CNPJ') {
    errors.documentType = 'Informe o tipo de documento.';
  } else {
    const documentError = energyDocumentError(form.document, form.documentType);
    if (documentError) errors.document = documentError;
  }
  if (!form.name.trim()) errors.name = 'Informe o nome do titular.';
  const email = form.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Informe um e-mail válido.';
  return errors;
}

export function hasEnergyErrors(errors: EnergyFieldErrors) {
  return Object.values(errors).some(Boolean);
}

export function buildEnergyPayload(form: {
  documentType: EnergyDocumentType;
  document: string;
  name: string;
  email: string;
  phone: string;
}) {
  return {
    documentType: form.documentType,
    document: normalizeDocument(form.document),
    name: form.name.trim(),
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
  };
}

export function energyRegistrationView(consumer: { document: string } | null) {
  if (!consumer) {
    return { registered: false, statusLabel: 'Não cadastrado', documentLabel: null as string | null };
  }
  return {
    registered: true,
    statusLabel: 'Cadastrado',
    documentLabel: concealDocument(consumer.document),
  };
}
