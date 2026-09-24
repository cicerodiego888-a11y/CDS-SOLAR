import { BadRequestException } from '@nestjs/common';
import { assertEnergyDocument, isValidCnpj, isValidCpf, normalizeDocument } from './energy-document';

const VALID_CPF = '52998224725';
const VALID_CNPJ = '11222333000181';

describe('documento energético', () => {
  it('normaliza removendo a máscara', () => {
    expect(normalizeDocument('529.982.247-25')).toBe(VALID_CPF);
    expect(normalizeDocument('11.222.333/0001-81')).toBe(VALID_CNPJ);
  });

  it('aceita CPF válido', () => {
    expect(isValidCpf(VALID_CPF)).toBe(true);
    expect(assertEnergyDocument('529.982.247-25', 'CPF')).toEqual({
      document: VALID_CPF,
      documentType: 'CPF',
    });
  });

  it('aceita CNPJ válido', () => {
    expect(isValidCnpj(VALID_CNPJ)).toBe(true);
    expect(assertEnergyDocument('11.222.333/0001-81', 'CNPJ')).toEqual({
      document: VALID_CNPJ,
      documentType: 'CNPJ',
    });
  });

  it('rejeita CPF inválido', () => {
    expect(isValidCpf('11111111111')).toBe(false);
    expect(() => assertEnergyDocument('111.111.111-11', 'CPF')).toThrow(BadRequestException);
    expect(() => assertEnergyDocument('111.111.111-11', 'CPF')).toThrow('CPF inválido.');
  });

  it('rejeita CNPJ inválido', () => {
    expect(isValidCnpj('11222333000180')).toBe(false);
    expect(() => assertEnergyDocument('11.222.333/0001-80', 'CNPJ')).toThrow('CNPJ inválido.');
  });

  it('exige documento e tipo coerente com o formato', () => {
    expect(() => assertEnergyDocument('   ', 'CPF')).toThrow('Informe o documento.');
    expect(() => assertEnergyDocument(VALID_CNPJ, 'CPF')).toThrow('O tipo de documento não corresponde ao formato informado.');
    expect(() => assertEnergyDocument(VALID_CPF, 'CNPJ')).toThrow('O tipo de documento não corresponde ao formato informado.');
    expect(() => assertEnergyDocument(VALID_CPF, 'RG')).toThrow('Tipo de documento inválido.');
  });
});
