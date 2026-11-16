import { existsSync, readFileSync } from 'node:fs';
import type { DisposableTiming } from './disposable-database-timings.js';

/**
 * Resumo legível de `OF2_TIMINGS_FILE` (DEC-063): por fase, quantidade, total,
 * média e máximo; e as suítes que mais esperaram e mais seguraram o lease.
 * Cada `DROP DATABASE` força um checkpoint imediato no PostgreSQL 16.
 */
export function summarizeDisposableTimings(file: string): string[] {
  if (!existsSync(file))
    return ['[of2-timings] nenhum registro (nenhuma suíte descartável rodou).'];
  const rows = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line) as DisposableTiming);
  const lines = ['[of2-timings] fase: n | total s | média ms | máx ms'];
  for (const phase of [...new Set(rows.map((r) => r.phase))]) {
    const ms = rows.filter((r) => r.phase === phase).map((r) => r.ms);
    const total = ms.reduce((a, b) => a + b, 0);
    const avg = Math.round(total / ms.length);
    lines.push(
      `[of2-timings] ${phase}: ${ms.length} | ${(total / 1000).toFixed(1)} | ${avg} | ${Math.max(...ms)}`,
    );
  }
  for (const phase of ['LEASE_WAIT', 'LEASE_HELD'] as const) {
    const top = rows
      .filter((r) => r.phase === phase)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 5)
      .map((r) => `${r.label}=${r.ms}ms`);
    if (top.length > 0) lines.push(`[of2-timings] maiores ${phase}: ${top.join(', ')}`);
  }
  const acquired = rows.filter((r) => r.phase === 'LEASE_WAIT').length;
  const released = rows.filter((r) => r.phase === 'LEASE_HELD').length;
  lines.push(`[of2-timings] leases obtidos=${acquired} liberados=${released}`);
  return lines;
}
