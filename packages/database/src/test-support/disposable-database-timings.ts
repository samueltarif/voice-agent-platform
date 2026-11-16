import { appendFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

/**
 * Instrumentação do ciclo de vida dos bancos descartáveis (DEC-063). Só ativa
 * com `OF2_TIMINGS_FILE` (caminho absoluto): grava uma linha JSON por fase com
 * rótulo da suíte, nome `of2_test_*`, pid e duração. Nunca grava URL,
 * usuário ou senha. Sem a variável, não faz nada.
 */
export type DisposableTimingPhase =
  'PROVE_TARGET' | 'LEASE_WAIT' | 'CREATE' | 'MIGRATE' | 'DRAIN' | 'DROP' | 'LEASE_HELD';

export interface DisposableTiming {
  readonly label: string;
  readonly phase: DisposableTimingPhase;
  readonly ms: number;
  readonly database?: string | undefined;
}

function timingsFile(): string | null {
  const file = process.env['OF2_TIMINGS_FILE'];
  return file && isAbsolute(file) ? file : null;
}

export function recordDisposableTiming(timing: DisposableTiming): void {
  const file = timingsFile();
  if (!file) return;
  const line = { ...timing, ms: Math.round(timing.ms), pid: process.pid, at: Date.now() };
  appendFileSync(file, `${JSON.stringify(line)}\n`);
}

/** Mede `work` e registra a fase, inclusive quando ela falha. */
export async function timeDisposablePhase<T>(
  timing: Omit<DisposableTiming, 'ms'>,
  work: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } finally {
    recordDisposableTiming({ ...timing, ms: performance.now() - started });
  }
}

/** Rótulo da suíte e instante de obtenção do lease, por base `of2_test_*`. */
const suites = new Map<string, { label: string; leaseAt: number | null }>();

export function registerDisposableSuite(database: string, label: string): void {
  suites.set(database, { label, leaseAt: null });
}

export function timeSuitePhase<T>(
  database: string,
  phase: DisposableTimingPhase,
  work: () => Promise<T>,
): Promise<T> {
  return timeDisposablePhase({ label: suites.get(database)?.label ?? '?', database, phase }, work);
}

export function markLeaseAcquired(database: string): void {
  const suite = suites.get(database);
  if (suite) suite.leaseAt = performance.now();
}

/** Registra quanto tempo a suíte segurou o lease exclusivo (CREATE → DROP). */
export function markLeaseReleased(database: string): void {
  const suite = suites.get(database);
  suites.delete(database);
  if (!suite || suite.leaseAt === null) return;
  const ms = performance.now() - suite.leaseAt;
  recordDisposableTiming({ label: suite.label, database, phase: 'LEASE_HELD', ms });
}
