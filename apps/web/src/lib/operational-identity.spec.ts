import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '../app');
const inversores = readFileSync(join(appDir, 'inversores/page.tsx'), 'utf8');
const equipamentos = readFileSync(join(appDir, 'equipamentos/page.tsx'), 'utf8');
const inversorDetalhe = readFileSync(join(appDir, 'inversores/[id]/page.tsx'), 'utf8');

describe('cadastro operacional — inversores e equipamentos', () => {
  it('inversor mantém externalId opcional com orientação visual', () => {
    assert.match(inversores, /Identificador externo/);
    assert.match(inversores, /Opcional — utilizado quando fornecido pelo fabricante\/API/);
    assert.match(inversores, /Número de série/);
    assert.match(inversores, /Fabricante/);
    assert.doesNotMatch(inversores, /APP_SECRET|API_KEY|TOKEN/);
  });

  it('equipamento permite associar gateway/datalogger ao inversor', () => {
    assert.match(equipamentos, /Equipamento associado ao inversor/);
    assert.match(equipamentos, /GATEWAY/);
    assert.match(equipamentos, /DATALOGGER/);
    assert.match(equipamentos, /inverterId/);
    assert.match(equipamentos, /Número de série/);
    assert.doesNotMatch(equipamentos, /APP_SECRET|API_KEY/);
  });

  it('detalhe do inversor distingue serial e gateway associado', () => {
    assert.match(inversorDetalhe, /Gateway \/ Datalogger associados/);
    assert.match(inversorDetalhe, /serial do gateway não é o serial do inversor/);
    assert.match(inversorDetalhe, /Identificador externo/);
  });
});
