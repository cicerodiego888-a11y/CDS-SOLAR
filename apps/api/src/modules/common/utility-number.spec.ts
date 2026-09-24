import { BadRequestException } from '@nestjs/common';
import { assertUtilityNumber, normalizeUtilityNumber, optionalContractAccount } from './utility-number';

describe('utility-number', () => {
  it('normaliza removendo máscara', () => {
    expect(normalizeUtilityNumber('11.230.436')).toBe('11230436');
    expect(normalizeUtilityNumber('003.005.596.601')).toBe('003005596601');
  });

  it('não transforma Conta Contrato em UC', () => {
    const uc = assertUtilityNumber('11230436', 'o número da unidade consumidora');
    const contract = optionalContractAccount('003005596601');
    expect(uc).toBe('11230436');
    expect(contract).toBe('003005596601');
    expect(uc).not.toBe(contract);
  });

  it('permite Conta Contrato vazia', () => {
    expect(optionalContractAccount('')).toBeNull();
    expect(optionalContractAccount(undefined)).toBeUndefined();
  });

  it('rejeita número vazio', () => {
    expect(() => assertUtilityNumber('  ', 'o número da unidade consumidora')).toThrow(BadRequestException);
  });
});
