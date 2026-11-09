import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
const envExample = readFileSync(join(repoRoot, '.env.example'), 'utf8');
const apiEnvExample = readFileSync(join(repoRoot, 'apps/api/.env.example'), 'utf8');

describe('env secrets hygiene', () => {
  it('.env está no .gitignore e .env.example é permitido', () => {
    assert.match(gitignore, /^\.env$/m);
    assert.match(gitignore, /^\.env\.\*$/m);
    assert.match(gitignore, /^!\.env\.example$/m);
  });

  it('.env.example não contém AUXSOL_APP_SECRET real', () => {
    assert.match(envExample, /^AUXSOL_APP_SECRET=\s*$/m);
    assert.match(apiEnvExample, /^AUXSOL_APP_SECRET=\s*$/m);
    assert.doesNotMatch(envExample, /AUXSOL_APP_SECRET=\S+/);
    assert.doesNotMatch(apiEnvExample, /AUXSOL_APP_SECRET=\S+/);
  });

  it('.env.example marca JWT como placeholders de exemplo', () => {
    assert.match(envExample, /JWT_SECRET=change-this-in-production/);
    assert.match(envExample, /JWT_REFRESH_SECRET=change-this-refresh-in-production/);
  });

  it('arquivo .env real não é exigido no repositório', () => {
    // Pode existir localmente, mas não deve estar versionado como fonte.
    assert.equal(existsSync(join(repoRoot, '.env.example')), true);
  });
});
