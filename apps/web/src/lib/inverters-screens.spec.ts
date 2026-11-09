import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const list = readFileSync(join(srcDir, 'app/inversores/page.tsx'), 'utf8');
const detail = readFileSync(join(srcDir, 'app/inversores/[id]/page.tsx'), 'utf8');
const css = readFileSync(join(srcDir, 'app/globals.css'), 'utf8');

describe('telas de inversores', () => {
  it('lista preserva APIs, busca server-side, filtros e colunas', () => {
    assert.match(list, /fetchApi<Inverter\[\]>\(`\/inverters/);
    assert.match(list, /fetchApi<Plant\[\]>\('\/plants'\)/);
    assert.match(list, /fetchApi<Manufacturer\[\]>\('\/manufacturers'\)/);
    assert.match(list, /query\.set\('search', filters\.search\)/);
    for (const id of ['busca-inv', 'filtro-usina', 'filtro-fab', 'filtro-status']) assert.match(list, new RegExp(id));
    for (const header of ['Inversor', 'Usina', 'Fabricante', 'Modelo', 'Número de série', 'Potência', 'Status', 'Ações']) {
      assert.match(list, new RegExp(`header: '${header}'`));
    }
    assert.match(list, /\/inverters\/\$\{row\.id\}\/status/);
  });

  it('lista aplica o padrão visual e distingue vazio de filtro sem resultado', () => {
    assert.match(list, /shell inverters-page/);
    assert.match(list, /eyebrow="Ativos"/);
    assert.match(list, /inverters-panel/);
    assert.match(list, /aria-live="polite"/);
    assert.match(list, /Nenhum inversor encontrado/);
    assert.match(list, /Nenhum registro encontrado/);
    assert.match(list, /LoadingState/);
    assert.match(list, /ErrorMessage/);
    assert.doesNotMatch(list, /style=\{\{/);
  });

  it('formulário preserva campos, payload e validações', () => {
    for (const id of ['usina-inv', 'fab-inv', 'modelo-inv', 'serie-inv', 'pot-inv', 'ext-inv', 'status-inv']) assert.match(list, new RegExp(id));
    assert.match(list, /plantId: form\.plantId,\s+manufacturerId: form\.manufacturerId,\s+model: form\.model\.trim\(\),\s+serialNumber: form\.serialNumber\.trim\(\),\s+ratedPowerKw,\s+externalId: form\.externalId\.trim\(\)/);
    assert.match(list, /Selecione a usina\./);
    assert.match(list, /Selecione o fabricante\./);
    assert.match(list, /Informe o número de série\./);
    assert.match(list, /A identidade oficial da integração fica no IntegrationBinding\./);
  });

  it('detalhe preserva APIs de monitoramento e ações de integração', () => {
    assert.match(detail, /\/inverters\/\$\{params\.id\}`/);
    assert.match(detail, /\/monitoring\/inverters\/\$\{params\.id\}\/history\?period=last7days/);
    assert.match(detail, /\/monitoring\/diagnostics\/inverters\/\$\{params\.id\}/);
    assert.match(detail, /collectInverterLive\(params\.id\)/);
    assert.match(detail, /COLLECTION_IN_PROGRESS_MESSAGE/);
    assert.match(detail, /\/inverters\/\$\{params\.id\}\/integration-binding\/validate/);
    assert.match(detail, /method: 'DELETE'/);
    assert.match(detail, /resolveOperationalIntegrationState/);
    assert.match(detail, /canOperate \?/);
    assert.match(detail, /canBind \?/);
  });

  it('detalhe organiza seções e separa serial, external ID e gateway', () => {
    assert.match(detail, /shell inverters-detail/);
    for (const title of ['Dados técnicos', 'Monitoramento ao vivo', 'Leitura recente', 'Gateway \\/ Datalogger associados', 'Integração', 'Diagnóstico Operacional', 'Disponibilidade', 'Alertas do inversor']) {
      assert.match(detail, new RegExp(`title="${title}"`));
    }
    assert.match(detail, /Identificador externo \(legado\)/);
    assert.match(detail, /binding\?\.externalId/);
    assert.match(detail, /equipmentTypeLabel\(row\.type\)/);
    assert.match(detail, /Sem dados de monitoramento/);
    assert.match(detail, /liveReading/);
    assert.match(detail, /formatPowerKw\(liveReading\?\.powerKw/);
    assert.match(detail, /formatEnergyKwh\(monitoring\?\.history\.energyKwh \?\? null, Boolean\(monitoring\?\.history\.hasData\)\)/);
    assert.doesNotMatch(detail, /style=\{\{/);
  });

  it('CSS de inversores usa apenas tokens para cores', () => {
    const start = css.indexOf('/* ---- Inversores (Sprint 12.8) ---- */');
    assert.ok(start >= 0);
    const end = css.indexOf('.auth-loading', start);
    const block = css.slice(start, end);
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(block, /rgba?\(/);
  });
});
