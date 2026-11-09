import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../app/login');
const loginPage = readFileSync(join(root, 'page.tsx'), 'utf8');

describe('login sem credenciais hardcoded', () => {
  it('inicia email e senha vazios', () => {
    assert.match(loginPage, /useState\(''\)/);
    assert.equal((loginPage.match(/useState\(''\)/g) || []).length >= 2, true);
  });

  it('não embute senha funcional conhecida', () => {
    assert.doesNotMatch(loginPage, /pdb100623/);
    assert.doesNotMatch(loginPage, /B7@123456/);
    assert.doesNotMatch(loginPage, /password\s*[:=]\s*['"][^'"]{6,}['"]/i);
    assert.doesNotMatch(loginPage, /useState\(['"][^'"]+['"]\)/);
  });

  it('não embute secrets de infraestrutura', () => {
    assert.doesNotMatch(loginPage, /JWT_SECRET|JWT_REFRESH_SECRET|APP_SECRET|AUXSOL_APP_SECRET/);
    assert.doesNotMatch(loginPage, /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.]+/);
  });
});
