import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWindowsCommandLine, quoteWindowsArg, run } from './start-b7-dev.mjs';

test('quoteWindowsArg protege argumentos com espaços', () => {
  assert.equal(quoteWindowsArg('--filter=@b7/api'), '--filter=@b7/api');
  assert.equal(quoteWindowsArg('a b'), '"a b"');
  assert.equal(quoteWindowsArg(''), '""');
});

test('buildWindowsCommandLine monta pnpm db:generate', () => {
  assert.equal(buildWindowsCommandLine('pnpm', ['db:generate']), 'pnpm db:generate');
  assert.equal(
    buildWindowsCommandLine('pnpm', ['--filter', '@b7/api', 'exec', 'prisma', 'migrate', 'deploy']),
    'pnpm --filter @b7/api exec prisma migrate deploy',
  );
});

test('run(pnpm --version) não falha com EINVAL', () => {
  const result = run('pnpm', ['--version']);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}`;
  assert.notEqual(result.error?.code, 'EINVAL', output);
  assert.equal(result.status, 0, output);
  assert.match(String(result.stdout ?? ''), /^\d+\.\d+/);
});
