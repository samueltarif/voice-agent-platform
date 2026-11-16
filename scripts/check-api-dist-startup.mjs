// Smoke test da API COMPILADA (DEC-061): roda depois de `pnpm build` em `pnpm check`.
// Detecta pacotes de workspace não emitidos em apps/api/dist (ex.: agent-tools),
// confirma bind só em loopback e que a inicialização não faz rede externa.
// Sem banco real (a URL é loopback e nunca é usada), sem segredos impressos.
import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = fileURLToPath(new URL('../apps/api/', import.meta.url));
const guard = new URL('./api-smoke-egress-guard.mjs', import.meta.url).href;
const entry = 'dist/apps/api/src/server.js';
const LISTENING = /listening on http:\/\/(\[[^\]]+\]|[^:/\s"]+):(\d+)/;
const TIMEOUT_MS = 30_000;

function fail(message) {
  console.error(`[api-dist-startup] ERRO: ${message}`);
  process.exitCode = 1;
}

function smokeEnv(extra) {
  const { publicKey } = generateKeyPairSync('ed25519');
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'smoke', alg: 'EdDSA', use: 'sig' };
  // Ambiente montado do zero: nenhuma credencial de Twilio, Millis ou IA é herdada.
  const env = {
    PATH: process.env.PATH ?? '',
    SYSTEMROOT: process.env.SYSTEMROOT ?? '',
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: '0',
    DATABASE_URL: 'postgresql://smoke@127.0.0.1:9/smoke_unused',
    INTERNAL_SERVICE_PUBLIC_JWKS: JSON.stringify({ keys: [jwk] }),
    ...extra,
  };
  if (Object.keys(env).some((k) => /TWILIO|MILLIS|OPENAI|ANTHROPIC|ELEVEN/i.test(k))) {
    throw new Error('provider credentials must never reach the smoke environment');
  }
  return env;
}

function startApi(extraEnv) {
  const child = spawn(
    process.execPath,
    ['--import', guard, '--import', './register-dist.js', entry],
    {
      cwd: apiDir,
      env: smokeEnv(extraEnv),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const state = { output: '', stderr: '', exitCode: null };
  child.stdout.on('data', (d) => (state.output += d));
  child.stderr.on('data', (d) => (state.stderr += d));
  const exited = new Promise((resolve) =>
    child.on('exit', (code) => {
      state.exitCode = code;
      resolve(code);
    }),
  );
  return { child, state, exited };
}

async function waitFor(predicate, exited) {
  const deadline = Date.now() + TIMEOUT_MS;
  let done = false;
  exited.then(() => (done = true));
  while (Date.now() < deadline) {
    const value = predicate();
    if (value || done) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

async function checkLoopbackStartup() {
  const api = startApi({});
  try {
    const match = await waitFor(
      () => (api.state.output + api.state.stderr).match(LISTENING),
      api.exited,
    );
    if (!match) return fail(`a API compilada não iniciou.\n${api.state.stderr.slice(-2000)}`);
    const [, address, port] = match;
    if (address !== '127.0.0.1') return fail(`bind inesperado: ${address}`);
    const base = `http://127.0.0.1:${port}`;
    const health = await fetch(`${base}/healthz`);
    if (health.status !== 200) return fail(`/healthz respondeu ${health.status}`);
    const turn = await fetch(`${base}/v1/knowledge/simulated-turn`, { method: 'POST' });
    if (turn.status !== 401) return fail(`simulated-turn sem credencial respondeu ${turn.status}`);
    if (api.state.stderr.includes('EGRESS_BLOCKED'))
      return fail('a API tentou acessar a rede externa');
    console.log(
      `[api-dist-startup] BIND=${address} HEALTHZ=200 SIMULATED_TURN_ROUTE=401 EGRESS_ATTEMPTS=0`,
    );
  } finally {
    api.child.kill();
    await api.exited;
  }
}

async function checkWildcardRefused() {
  const api = startApi({ HOST: '0.0.0.0' });
  const timer = setTimeout(() => api.child.kill(), TIMEOUT_MS);
  const code = await api.exited;
  clearTimeout(timer);
  if (code === 0 || LISTENING.test(api.state.output)) {
    return fail('HOST=0.0.0.0 sem API_ALLOW_PUBLIC_BIND=true deveria ser recusado');
  }
  console.log('[api-dist-startup] WILDCARD_WITHOUT_OPT_IN=REFUSED');
}

if (!existsSync(join(apiDir, entry))) {
  fail(`build ausente (${entry}); rode "pnpm build" antes.`);
} else {
  await checkLoopbackStartup();
  if (!process.exitCode) await checkWildcardRefused();
  if (!process.exitCode)
    console.log('[api-dist-startup] SUCESSO: API compilada iniciou só em loopback.');
}
