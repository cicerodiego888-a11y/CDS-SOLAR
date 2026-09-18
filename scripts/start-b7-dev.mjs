import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THIS_FILE = fileURLToPath(import.meta.url);
const COMPOSE_FILE = 'docker-compose.yml';
const WINDOWS = process.platform === 'win32';
const PNPM = 'pnpm';
const POSTGRES_PORT = 5432;
const REDIS_PORT = 6379;
const API_PORT = 3001;
const WEB_PORT = 3000;
const WAIT_MS = 60_000;
const APP_WAIT_MS = 90_000;

let childProcess;

function log(message) {
  console.log(`[B7] ${message}`);
}

function fail(message) {
  console.error(`[B7] ERRO: ${message}`);
  process.exit(1);
}

function redact(text) {
  return String(text ?? '')
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, 'postgresql://***@')
    .replace(/AUXSOL_APP_SECRET=\S+/gi, 'AUXSOL_APP_SECRET=***')
    .replace(/JWT(?:_REFRESH)?_SECRET=\S+/gi, 'JWT_SECRET=***');
}

/** Node 24 + Windows: spawn de .cmd com shell:false/windowsHide gera EINVAL. */
function quoteWindowsArg(arg) {
  const value = String(arg);
  if (value.length === 0) return '""';
  if (!/[\s"&<>|^()]/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function buildWindowsCommandLine(command, args = []) {
  return [command, ...args].map(quoteWindowsArg).join(' ');
}

function spawnOptions(options = {}) {
  return {
    cwd: options.cwd ?? ROOT,
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, COMPOSE_IGNORE_ORPHANS: '1', ...(options.env ?? {}) },
    timeout: options.timeout,
  };
}

function run(command, args, options = {}) {
  const opts = spawnOptions(options);
  const result = WINDOWS
    ? spawnSync(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', buildWindowsCommandLine(command, args)],
        { ...opts, windowsVerbatimArguments: true },
      )
    : spawnSync(command, args, opts);

  if (result.error?.code === 'EINVAL') {
    result.status = result.status ?? 1;
  }
  return result;
}

function combinedOutput(result) {
  return redact(
    `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.stack ?? result.error?.message ?? ''}`,
  );
}

function tryPort(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const finish = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function isPortOpen(port) {
  return (await tryPort(port, '127.0.0.1')) || (await tryPort(port, '::1'));
}

async function isPortOpenStable(port) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await isPortOpen(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function waitForPort(port, label, timeoutMs = WAIT_MS) {
  const started = Date.now();
  log(`${label}: iniciando...`);
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen(port)) {
      log(`${label}: OK`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  fail(`${label} não ficou disponível.`);
}

function dockerReady() {
  const result = run('docker', ['info'], { timeout: 20_000 });
  return result.status === 0;
}

function envFlag(filePath, key) {
  if (!existsSync(filePath)) return false;
  const line = readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .find((item) => item.startsWith(`${key}=`));
  if (!line) return false;
  const value = line.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, '');
  return Boolean(value);
}

function auxsolStatus() {
  const envPath = path.join(ROOT, 'apps', 'api', '.env');
  const configured = envFlag(envPath, 'AUXSOL_API_BASE_URL')
    && envFlag(envPath, 'AUXSOL_APP_ID')
    && envFlag(envPath, 'AUXSOL_APP_SECRET');
  return configured ? 'configurada' : 'pendente';
}

function ensureDockerServices() {
  log('Docker: verificando...');
  if (!dockerReady()) {
    fail('Docker Desktop precisa estar iniciado. Abra o Docker Desktop e execute novamente: pnpm start:b7');
  }
  log('Docker: OK');

  const result = run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--no-recreate'], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    fail('Não foi possível iniciar PostgreSQL/Redis (docker compose).');
  }
}

function generatePrismaClient() {
  log('Prisma Client: gerando...');
  const result = run(PNPM, ['db:generate']);
  const output = combinedOutput(result);
  if (/EINVAL/i.test(output)) {
    if (output.trim()) console.error(output.trim());
    fail('Falha ao gerar o Prisma Client (spawn EINVAL no Windows).');
  }
  if (result.status === 0) {
    log('Prisma Client: OK');
    return;
  }
  if (/EPERM|EBUSY|operation not permitted/i.test(output)) {
    log('Prisma Client: já em uso, mantido.');
    return;
  }
  if (output.trim()) console.error(output.trim());
  fail('Falha ao gerar o Prisma Client.');
}

async function applyPendingMigrations() {
  log('Banco: verificando migrations...');
  const started = Date.now();
  let result;
  let output = '';
  while (Date.now() - started < WAIT_MS) {
    result = run(PNPM, ['--filter', '@b7/api', 'exec', 'prisma', 'migrate', 'deploy']);
    output = combinedOutput(result);
    if (result.status === 0) break;
    if (/advisory lock|P1002|timed out/i.test(output)) {
      log('Banco: aguardando lock de migration...');
      await new Promise((resolve) => setTimeout(resolve, 4000));
      continue;
    }
    break;
  }
  if (result?.status !== 0) {
    if (output.trim()) console.error(output.trim());
    fail('Falha ao aplicar migrations pendentes.');
  }
  const already = /No pending migrations|already in sync|Database schema is up to date/i.test(output);
  if (already) {
    log('Banco: migrations atualizadas.');
    return;
  }
  if (/Applied migration|Applying migration/i.test(output)) {
    log('Banco: aplicando migration...');
    if (output.trim()) console.log(output.trim());
    log('Banco: OK.');
    return;
  }
  log('Banco: migrations atualizadas.');
}

function stopChild() {
  if (!childProcess?.pid) return;
  if (WINDOWS) {
    spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `taskkill /pid ${childProcess.pid} /t /f`], {
      stdio: 'ignore',
      windowsVerbatimArguments: true,
    });
  } else {
    childProcess.kill('SIGINT');
  }
  childProcess = undefined;
}

function startDev(args) {
  const opts = {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, COMPOSE_IGNORE_ORPHANS: '1' },
  };
  childProcess = WINDOWS
    ? spawn(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', buildWindowsCommandLine(PNPM, args)],
        { ...opts, windowsVerbatimArguments: true },
      )
    : spawn(PNPM, args, opts);
  childProcess.on('exit', (code, signal) => {
    if (signal) process.exit(0);
    process.exit(code ?? 0);
  });
}

function printReady() {
  console.log(`
========================================
 B7 SOLAR — AMBIENTE PRONTO
========================================

 PostgreSQL : OK
 Redis      : OK
 API        : http://localhost:${API_PORT}
 Web        : http://localhost:${WEB_PORT}
 AUXSOL     : ${auxsolStatus()}
 Banco      : OK

 Abra:
 http://localhost:${WEB_PORT}

========================================
`);
}

function holdProcess() {
  // Promise vazia NÃO segura o event loop do Node. Sem filho (API/Web já no ar),
  // o processo encerrava sozinho e devolvia o prompt do PowerShell.
  setInterval(() => {}, 60_000);
  if (process.stdin?.isTTY) process.stdin.resume();
  log('Launcher ativo. Ctrl+C encerra este terminal; PostgreSQL e Redis permanecem no ar.');
  return new Promise(() => {});
}

async function startApps() {
  const apiUp = await isPortOpenStable(API_PORT);
  const webUp = await isPortOpenStable(WEB_PORT);

  if (apiUp) log(`API já está em execução na porta ${API_PORT}.`);
  if (webUp) log(`Web já está em execução na porta ${WEB_PORT}.`);

  if (apiUp && webUp) {
    printReady();
    await holdProcess();
    return;
  }

  if (!apiUp && !webUp) {
    log('Iniciando API e Web (turbo)...');
    startDev(['exec', 'turbo', 'dev', '--filter=@b7/api', '--filter=@b7/web', '--ui=stream']);
  } else if (!apiUp) {
    log('Iniciando API...');
    startDev(['--filter', '@b7/api', 'dev']);
  } else {
    log('Iniciando Web...');
    startDev(['--filter', '@b7/web', 'dev']);
  }

  if (!apiUp) await waitForPort(API_PORT, 'API', APP_WAIT_MS);
  if (!webUp) await waitForPort(WEB_PORT, 'Web', APP_WAIT_MS);
  printReady();
  await holdProcess();
}

function bindSignals() {
  const shutdown = () => {
    if (childProcess?.pid) {
      log('Encerrando API/Web iniciados por este launcher. PostgreSQL e Redis permanecem no ar.');
      stopChild();
    } else {
      log('Saindo do launcher. API, Web, PostgreSQL e Redis que já estavam no ar continuam.');
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function main() {
  bindSignals();
  ensureDockerServices();
  await waitForPort(POSTGRES_PORT, 'PostgreSQL');
  await waitForPort(REDIS_PORT, 'Redis');
  generatePrismaClient();
  await applyPendingMigrations();
  await startApps();
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === THIS_FILE;

if (invokedDirectly) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : 'Falha inesperada na inicialização.';
    fail(message);
  });
}

export { buildWindowsCommandLine, quoteWindowsArg, run };
