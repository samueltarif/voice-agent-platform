// `pnpm test` em duas fases (DEC-063). Os testes de integração (`*integration.test.*`)
// usam o MESMO PostgreSQL local: rodam em SÉRIE, sem disputar disco/CPU com os
// testes puros. Todo o resto roda em paralelo. Com argumentos, repassa direto ao
// Vitest (uso local: `pnpm test <arquivo>`).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const INTEGRATION = 'integration.test';
const extra = process.argv.slice(2);

// Executa o CLI do Vitest com o próprio Node, sem shell (DEP0190): os
// argumentos chegam intactos, sem concatenação nem interpretação de shell.
const vitestPackage = createRequire(import.meta.url).resolve('vitest/package.json');
const vitestCli = join(dirname(vitestPackage), 'vitest.mjs');

function vitest(args) {
  const started = Date.now();
  const child = spawn(process.execPath, [vitestCli, 'run', ...args], { stdio: 'inherit' });
  return new Promise((resolve) =>
    child.on('exit', (code) => resolve({ code: code ?? 1, ms: Date.now() - started })),
  );
}

if (extra.length > 0) {
  process.exit((await vitest(extra)).code);
}

const parallel = await vitest([
  '--exclude',
  `**/*${INTEGRATION}.ts`,
  '--exclude',
  `**/*${INTEGRATION}.tsx`,
]);
console.log(
  `[test-phases] fase 1 (paralela, sem integração): exit ${parallel.code} em ${Math.round(parallel.ms / 1000)} s`,
);
const serial = await vitest(['--no-file-parallelism', INTEGRATION]);
console.log(
  `[test-phases] fase 2 (integração em série): exit ${serial.code} em ${Math.round(serial.ms / 1000)} s`,
);
process.exit(parallel.code !== 0 ? parallel.code : serial.code);
