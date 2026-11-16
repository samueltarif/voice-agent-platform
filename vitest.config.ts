import { defineConfig } from 'vitest/config';

/**
 * Paralelismo padrão 4. `VITEST_MAX_WORKERS` (1–16) permite medir contenção em
 * hosts lentos (ex.: Docker Desktop no Windows) sem alterar tempos limite.
 */
function resolveMaxWorkers(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 16 ? value : 4;
}

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    maxWorkers: resolveMaxWorkers(process.env['VITEST_MAX_WORKERS']),
  },
});
