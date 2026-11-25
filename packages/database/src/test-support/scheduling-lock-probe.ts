import pg from 'pg';

/**
 * E1 (2ª auditoria) — conexão INDEPENDENTE para provocar e observar esperas
 * por trava de forma determinística: segura a trava exata do telefone ou uma
 * linha, e espera até que uma sessão identificada esteja bloqueada nela.
 * Nunca usa atrasos arbitrários como sincronização: só condições do catálogo
 * (`pg_locks`, `pg_blocking_pids`) com prazo máximo para falhar o teste.
 */
export interface SchedulingLockProbe {
  readonly pid: number;
  /** Trava de sessão da MESMA chave usada por `lockSuppressionKey`. */
  holdPhoneLock(organizationId: string, phoneE164: string): Promise<void>;
  releasePhoneLock(organizationId: string, phoneE164: string): Promise<void>;
  /** Abre transação e trava a linha (ex.: `SELECT ... FOR UPDATE`). */
  holdInTransaction(statement: string, params: readonly unknown[]): Promise<void>;
  commit(): Promise<void>;
  /** PIDs que esperam pela trava do telefone, na ordem da fila. */
  phoneLockWaiters(organizationId: string, phoneE164: string): Promise<number[]>;
  waitForPhoneLockWaiters(
    organizationId: string,
    phoneE164: string,
    count: number,
  ): Promise<number[]>;
  /** Espera até `count` sessões bloqueadas (direta ou indiretamente na fila) por `pid`. */
  waitForSessionsBlockedBy(pid: number, count: number): Promise<number[]>;
  close(): Promise<void>;
}

const WAIT_LIMIT_MS = 15_000;
const POLL_MS = 5;

const PHONE_WAITERS_SQL = `
  SELECT l.pid
    FROM pg_locks l
    JOIN pg_stat_activity a ON a.pid = l.pid
   WHERE l.locktype = 'advisory'
     AND NOT l.granted
     AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
     AND ((l.classid::bigint << 32) | l.objid::bigint) = hashtextextended($1 || ':' || $2, 0)
   ORDER BY a.query_start, l.pid`;

const BLOCKED_BY_SQL = `
  SELECT pid FROM pg_stat_activity
   WHERE datname = current_database() AND $1::int = ANY (pg_blocking_pids(pid))
   ORDER BY query_start, pid`;

async function pollUntil<T>(read: () => Promise<T>, done: (value: T) => boolean, what: string) {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`Lock probe timed out waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

export async function createSchedulingLockProbe(
  connectionString: string,
): Promise<SchedulingLockProbe> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  const pids = async (statement: string, params: readonly unknown[]) =>
    (await client.query<{ pid: number }>(statement, [...params])).rows.map((row) => row.pid);
  const probe: SchedulingLockProbe = {
    pid: rows[0]!.pid,
    holdPhoneLock: async (org, phone) => {
      await client.query("SELECT pg_advisory_lock(hashtextextended($1 || ':' || $2, 0))", [
        org,
        phone,
      ]);
    },
    releasePhoneLock: async (org, phone) => {
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1 || ':' || $2, 0))", [
        org,
        phone,
      ]);
    },
    holdInTransaction: async (statement, params) => {
      await client.query('BEGIN');
      await client.query(statement, [...params]);
    },
    commit: async () => {
      await client.query('COMMIT');
    },
    phoneLockWaiters: (org, phone) => pids(PHONE_WAITERS_SQL, [org, phone]),
    waitForPhoneLockWaiters: (org, phone, count) =>
      pollUntil(
        () => pids(PHONE_WAITERS_SQL, [org, phone]),
        (w) => w.length >= count,
        `${count} phone-lock waiter(s)`,
      ),
    waitForSessionsBlockedBy: (pid, count) =>
      pollUntil(
        () => pids(BLOCKED_BY_SQL, [pid]),
        (w) => w.length >= count,
        `${count} session(s) blocked by ${pid}`,
      ),
    close: async () => {
      await client.end();
    },
  };
  return probe;
}
