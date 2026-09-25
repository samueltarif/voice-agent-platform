import { generateKeyPairSync } from 'node:crypto';
import { spawn, execSync } from 'node:child_process';

function killProcessTree(proc) {
  if (!proc || !proc.pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
    } else {
      proc.kill('SIGKILL');
    }
  } catch {
    // Process might already be terminated
  }
}

async function waitForHttp(url, timeoutMs = 20000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status === 200) {
        return res;
      }
    } catch {
      // Server not ready yet; continue polling
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timeout waiting for ${url} after ${timeoutMs}ms`);
}

let apiProcess = null;
let webProcess = null;
let success = false;
const startTime = Date.now();

try {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateJwk = privateKey.export({ format: 'jwk' });
  const publicJwk = publicKey.export({ format: 'jwk' });
  privateJwk.kid = 'test-key-1';
  publicJwk.kid = 'test-key-1';
  publicJwk.alg = 'EdDSA';

  const publicJwks = { keys: [publicJwk] };

  console.log('[TEST-BOOT] Spawning apps/api on port 3001...');
  apiProcess = spawn('node', ['--import', './register-dist.js', 'dist/apps/api/src/server.js'], {
    cwd: 'apps/api',
    shell: false,
    env: {
      ...process.env,
      PORT: '3001',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/voice_agent_dev',
      INTERNAL_SERVICE_PUBLIC_JWKS: JSON.stringify(publicJwks),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  console.log('[TEST-BOOT] Spawning apps/web on port 3000...');
  webProcess = spawn('node', ['./node_modules/next/dist/bin/next', 'start', '-p', '3000'], {
    cwd: 'apps/web',
    shell: false,
    env: {
      ...process.env,
      PORT: '3000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/voice_agent_dev',
      BETTER_AUTH_URL: 'http://localhost:3000',
      BETTER_AUTH_SECRET: 'development-insecure-secret-minimum-32-characters-required!',
      INTERNAL_SERVICE_PRIVATE_JWK: JSON.stringify(privateJwk),
      INTERNAL_SERVICE_API_URL: 'http://localhost:3001',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  console.log('[TEST-BOOT] Polling apps/api readiness...');
  await waitForHttp('http://localhost:3001/healthz', 15000);
  console.log('[TEST-BOOT] apps/api is READY');

  console.log('[TEST-BOOT] Polling apps/web readiness...');
  await waitForHttp('http://localhost:3000/dashboard', 20000);
  console.log('[TEST-BOOT] apps/web is READY');

  success = true;
  console.log(
    `[TEST-BOOT] SUCCESS: Both servers booted and verified ready in ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
  );
} catch (err) {
  console.error('[TEST-BOOT] FAILED:', err.message);
  success = false;
} finally {
  console.log('[TEST-BOOT] Running deterministic cleanup in finally block...');
  killProcessTree(apiProcess);
  killProcessTree(webProcess);
  console.log('[TEST-BOOT] Child processes terminated.');
  // Set natural exit code without process.exit()
  process.exitCode = success ? 0 : 1;
}
