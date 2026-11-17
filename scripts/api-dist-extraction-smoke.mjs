// Smoke da extração na API COMPILADA (DEC-065): prova que `extraction-worker.js`
// foi emitido em apps/api/dist e é resolvido/iniciado pelo worker_threads com o
// mesmo resolvedor do dist, sem rede. Usa um DOCX mínimo embutido (sem segredos).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TINY_DOCX_BASE64 =
  'UEsDBBQAAAAIAG6KcF2Rp0i1vAAAAAIBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbF2PwUrFMBBFfyVkK81UFyLS9C0El+ri+QFDMu0LZmZCEmv9e6nCW7i+nHO402nnbDaqLal4e+tGa0iCxiSrt+/n5+HBnubp/F2omZ2zNG8vvZdHgBYuxNicFpKd86KVsTendYWC4QNXgrtxvIeg0kn60A+HnafXjWpNkcwb1v6CTN7Cl9YIUcMnk3S3c7bm6Q87yt5iKTkF7EkFNon/moMuSwp05Q9bqRqotSQrZ3ddGJPcHHqYJ/g9Nf8AUEsDBBQAAAAIAG6KcF0Zi44UmgAAAMoAAAARAAAAd29yZC9kb2N1bWVudC54bWxFzk0KwjAQBeCrlOzbVAWR0p+de6EeICaxDXRmwky09faSunDzPRh4j2mHDZbi7VkCYacOVa0Kj5ZcwKlT9/FaXtTQt2vjyL7AYyo2WFCatVNzSrHRWuzswUhF0eMGy5MYTJKKeNIrsYtM1osEnGDRx7o+azABVZ58kPvkjBnOpH5kgwJBhLi4jeXpULc637O8G3d/Xf3/q/8CUEsBAhQDFAAAAAgAbopwXZGnSLW8AAAAAgEAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAACABuinBdGYuOFJoAAADKAAAAEQAAAAAAAAAAAAAAgAHtAAAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAIAAgCAAAAAtgEAAAAA';

const PROBE = fileURLToPath(new URL('./api-dist-extraction-probe.mjs', import.meta.url));

/** Executa a extração real do dist num processo isolado com a guarda de saída. */
export function checkCompiledExtraction({ apiDir, guard, env }) {
  const child = spawn(
    process.execPath,
    ['--import', guard, '--import', './register-dist.js', PROBE],
    {
      cwd: apiDir,
      env: { ...env, SMOKE_DOCX: TINY_DOCX_BASE64 },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));
  return new Promise((resolve) => {
    const timer = setTimeout(() => child.kill(), 30_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      const ok = code === 0 && stdout === 'EXTRACTION_OK' && !stderr.includes('EGRESS_BLOCKED');
      resolve({ ok, detail: ok ? '' : `${stdout}\n${stderr.slice(-2000)}` });
    });
  });
}
