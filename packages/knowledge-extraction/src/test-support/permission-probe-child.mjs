// SOMENTE TESTES: tenta o que o filho NÃO pode fazer e devolve os códigos.
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const outside = fileURLToPath(new URL('../../../../package.json', import.meta.url));
const attempts = {
  readOutside: () => fs.readFileSync(outside),
  write: () => fs.writeFileSync(fileURLToPath(new URL('./written.txt', import.meta.url)), 'x'),
  spawn: () => childProcess.spawnSync(process.execPath, ['-v']),
  worker: () => new Worker('0', { eval: true }),
  addon: () =>
    process.dlopen({ exports: {} }, fileURLToPath(new URL('./none.node', import.meta.url))),
};
const results = {};
for (const [name, attempt] of Object.entries(attempts)) {
  try {
    attempt();
    results[name] = 'ALLOWED';
  } catch (error) {
    results[name] = error.code ?? 'ERROR';
  }
}
process.stdout.write(`${JSON.stringify({ ok: true, text: JSON.stringify(results) })}\n`);
process.exit(0);
