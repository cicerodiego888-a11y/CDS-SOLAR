import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '../app');
const clientesPage = readFileSync(join(appDir, 'clientes/page.tsx'), 'utf8');
const clienteDetalhe = readFileSync(join(appDir, 'clientes/[id]/page.tsx'), 'utf8');
const usinasPage = readFileSync(join(appDir, 'usinas/page.tsx'), 'utf8');
const unidadesPage = readFileSync(join(appDir, 'unidades-consumidoras/page.tsx'), 'utf8');

const routes = [
  'page.tsx',
  'login/page.tsx',
  'acesso-negado/page.tsx',
  'operacao/page.tsx',
  'monitoramento/page.tsx',
  'alertas/page.tsx',
  'alertas/[id]/page.tsx',
  'clientes/page.tsx',
  'clientes/[id]/page.tsx',
  'usinas/page.tsx',
  'usinas/[id]/page.tsx',
  'inversores/page.tsx',
  'inversores/[id]/page.tsx',
  'equipamentos/page.tsx',
  'distribuidoras/page.tsx',
  'distribuidoras/[id]/page.tsx',
  'consumidores/page.tsx',
  'consumidores/[id]/page.tsx',
  'unidades-consumidoras/page.tsx',
  'unidades-consumidoras/[id]/page.tsx',
  'gestao-energia/page.tsx',
  'gestao-energia/rateios/page.tsx',
  'relatorios/page.tsx',
  'configuracoes/page.tsx',
];

describe('telas de cliente e usina', () => {
  it('a lista de clientes continua carregando, criando e editando', () => {
    assert.match(clientesPage, /fetchApi<Customer\[\]>\('\/customers'\)/);
    assert.match(clientesPage, /method: 'POST'/);
    assert.match(clientesPage, /'\/customers'/);
    assert.match(clientesPage, /\/customers\/\$\{editing\.id\}/);
    assert.match(clientesPage, /method: 'PATCH'/);
    assert.match(clientesPage, /Novo cliente/);
    assert.match(clientesPage, /Editar cliente/);
    assert.match(clientesPage, /CPF\/CNPJ/);
    assert.doesNotMatch(clientesPage, /DADOS ENERGÉTICOS/);
  });

  it('o detalhe mantém energia, UCs e usinas', () => {
    assert.match(clienteDetalhe, /Usinas do cliente/);
    assert.match(clienteDetalhe, /DADOS ENERGÉTICOS/);
    assert.match(clienteDetalhe, /UNIDADES CONSUMIDORAS/);
    assert.match(clienteDetalhe, /Cadastrar consumidor energético/);
    assert.match(clienteDetalhe, /Cadastrar unidade consumidora/);
    assert.match(clienteDetalhe, /Conta contrato/);
    assert.match(clienteDetalhe, /\/customers\/\$\{params\.id\}\/consumer-units/);
    assert.match(clienteDetalhe, /Este consumidor ainda não possui unidade consumidora cadastrada/);
    assert.match(clienteDetalhe, /Dados cadastrais/);
    assert.match(clienteDetalhe, /Informações comerciais do Customer/);
    assert.doesNotMatch(clienteDetalhe, /name:\s*data\.name/);
  });

  it('lista de clientes usa busca local e estados claros', () => {
    assert.match(clientesPage, /busca-cliente/);
    assert.match(clientesPage, /LoadingState/);
    assert.match(clientesPage, /ErrorMessage/);
    assert.match(clientesPage, /EmptyState/);
    assert.match(clientesPage, /Nenhum cliente encontrado/);
    assert.match(clientesPage, /Novo cliente/);
  });

  it('a usina seleciona UC do cliente e deriva a distribuidora', () => {
    assert.match(usinasPage, /Unidade consumidora/);
    assert.match(usinasPage, /consumerUnitId/);
    assert.match(usinasPage, /\/customers\/\$\{customerId\}\/consumer-units/);
    assert.match(usinasPage, /applyPlantUnitSelection/);
    assert.match(usinasPage, /disabled/);
    assert.match(usinasPage, /Concessionária/);
  });

  it('a listagem de UCs exibe Conta contrato', () => {
    assert.match(unidadesPage, /Conta contrato/);
    assert.match(unidadesPage, /contractAccount/);
  });

  it('as rotas existentes continuam no app', () => {
    for (const route of routes) {
      assert.equal(existsSync(join(appDir, route)), true, route);
    }
  });
});
