import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildEnergyPayload,
  concealDocument,
  energyDocumentError,
  energyRegistrationView,
  hasEnergyErrors,
  maskDocumentInput,
  validateEnergyForm,
} from './energy-document.ts';

const VALID_CPF = '529.982.247-25';
const VALID_CNPJ = '11.222.333/0001-81';

describe('cadastro energético na tela', () => {
  it('aplica máscara visual e oculta o documento salvo', () => {
    assert.equal(maskDocumentInput('52998224725', 'CPF'), '529.982.247-25');
    assert.equal(maskDocumentInput('11222333000181', 'CNPJ'), '11.222.333/0001-81');
    assert.equal(concealDocument('52998224725'), '***...25');
    assert.equal(concealDocument('52998224725').includes('529982247'), false);
  });

  it('mostra mensagem clara para CPF e CNPJ inválidos', () => {
    assert.equal(energyDocumentError('111.111.111-11', 'CPF'), 'CPF inválido.');
    assert.equal(energyDocumentError('11.222.333/0001-80', 'CNPJ'), 'CNPJ inválido.');
    assert.equal(energyDocumentError('', 'CPF'), 'Informe o documento.');
    assert.equal(
      energyDocumentError('11.222.333/0001-81', 'CPF'),
      'O tipo de documento não corresponde ao formato informado.',
    );
    const invalid = validateEnergyForm({ documentType: 'CPF', document: '111.111.111-11', name: '', email: 'sem-arroba' });
    assert.equal(invalid.document, 'CPF inválido.');
    assert.equal(invalid.name, 'Informe o nome do titular.');
    assert.equal(invalid.email, 'Informe um e-mail válido.');
    assert.equal(hasEnergyErrors(invalid), true);
  });

  it('aceita CPF e CNPJ válidos e grava o documento normalizado', () => {
    assert.equal(validateEnergyForm({ documentType: 'CPF', document: VALID_CPF, name: 'Titular', email: '' }).document, undefined);
    assert.equal(validateEnergyForm({ documentType: 'CNPJ', document: VALID_CNPJ, name: 'Empresa', email: 'a@b7.test' }).document, undefined);
    const payload = buildEnergyPayload({
      documentType: 'CPF',
      document: VALID_CPF,
      name: ' Titular ',
      email: '',
      phone: '',
    });
    assert.deepEqual(payload, {
      documentType: 'CPF',
      document: '52998224725',
      name: 'Titular',
      email: null,
      phone: null,
    });
    assert.equal('customerName' in payload, false);
    assert.equal('customerEmail' in payload, false);
  });

  it('separa o status de quem ainda não tem consumidor', () => {
    assert.deepEqual(energyRegistrationView(null), {
      registered: false,
      statusLabel: 'Não cadastrado',
      documentLabel: null,
    });
    const registered = energyRegistrationView({ document: '52998224725' });
    assert.equal(registered.registered, true);
    assert.equal(registered.statusLabel, 'Cadastrado');
    assert.equal(registered.documentLabel, '***...25');
  });
});
