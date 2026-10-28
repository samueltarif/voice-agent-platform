import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createDatabaseConnection, type DatabaseInstance } from '../client/connection.js';
import { runMigrations } from '../client/migrate.js';
import { collectTestDatabaseEvidence } from './collect-test-database-evidence.js';
import { waitForDatabaseDrain } from './wait-for-database-drain.js';
import {
  acquireDisposableDatabaseLease,
  releaseDisposableDatabaseLease,
} from './disposable-database-lease.js';
import {
  evaluateTestTargetEvidence,
  isDisposableDatabaseName,
  isLoopbackHost,
  resolveTestAdminUrl,
  type TestTargetEvidence,
} from './test-database-target-evidence.js';

/**
 * Banco PostgreSQL DESCARTÁVEL por suíte (008-OF2). Antes de QUALQUER DDL, o
 * destino precisa ser comprovado local e descartável (guarda pura +
 * evidências do servidor e, em Docker Desktop/WSL2, do container autorizado).
 * Só bases `of2_test_<hex>` criadas por ESTE processo podem ser removidas.
 * Nenhuma connection string é impressa.
 */
const ADMIN_URL = resolveTestAdminUrl(process.env);
const createdByThisRun = new Set<string>();
export const DISPOSABLE_DB_URL_ENV = 'DURABLE_OUTBOUND_DISPOSABLE_DATABASE_URL';

export interface DisposableTestDatabase {
  readonly name: string;
  readonly url: string;
  readonly db: DatabaseInstance;
  drop(): Promise<void>;
}

export interface DisposableDatabaseOptions {
  /** Injeção apenas para testes da própria guarda. */
  readonly collectEvidence?: ((db: DatabaseInstance) => Promise<TestTargetEvidence>) | undefined;
  /** Injeção apenas para o teste de falha induzida de migration. */
  readonly runMigrationsFn?: ((options: { connectionString: string }) => Promise<void>) | undefined;
  /**
   * Injeção apenas para os testes da guarda comprovarem, pelo NOME exato, que
   * nenhuma base foi criada. Qualquer valor fora de `of2_test_<12 hex>` é
   * recusado ANTES de qualquer DDL.
   */
  readonly databaseName?: string | undefined;
}

function resolveDatabaseName(options: DisposableDatabaseOptions): string {
  if (options.databaseName === undefined) {
    return `of2_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  if (!isDisposableDatabaseName(options.databaseName)) {
    throw new Error(
      'Refusing an injected database name that is not disposable (of2_test_<12 hex>).',
    );
  }
  return options.databaseName;
}

export function assertDisposableDatabaseUrl(url: string): void {
  const parsed = new URL(url);
  if (!isLoopbackHost(parsed.hostname) || !isDisposableDatabaseName(parsed.pathname.slice(1))) {
    throw new Error('Refusing a database that was not created as disposable for this test run.');
  }
}

async function proveTarget(db: DatabaseInstance, options: DisposableDatabaseOptions) {
  const evidence = options.collectEvidence
    ? await options.collectEvidence(db)
    : await collectTestDatabaseEvidence({ adminUrl: ADMIN_URL, db });
  const decision = evaluateTestTargetEvidence(evidence);
  if (!decision.accepted) {
    throw new Error(
      `Refusing unproven PostgreSQL test target (${decision.reason}); no DDL executed.`,
    );
  }
  return decision.mode;
}

function withDatabase(url: string, name: string): string {
  const target = new URL(url);
  target.pathname = `/${name}`;
  return target.toString();
}

export async function createDisposableTestDatabase(
  _tag: string,
  options: DisposableDatabaseOptions = {},
): Promise<DisposableTestDatabase> {
  const name = resolveDatabaseName(options);
  if (!isLoopbackHost(new URL(ADMIN_URL).hostname)) {
    throw new Error(
      'Refusing unproven PostgreSQL test target (CLIENT_HOST_NOT_LOOPBACK); no DDL executed.',
    );
  }
  const admin = createDatabaseConnection({ connectionString: ADMIN_URL, maxConnections: 1 });
  try {
    await proveTarget(admin.db, options);
    await acquireDisposableDatabaseLease(ADMIN_URL);
    await admin.db.execute(sql.raw(`CREATE DATABASE "${name}"`)).catch(async (error: unknown) => {
      await releaseDisposableDatabaseLease();
      throw error;
    });
    createdByThisRun.add(name);
  } finally {
    await admin.pool.end();
  }
  return openMigratedOrCleanUp({ name, options });
}

/**
 * P1 — qualquer falha APÓS o CREATE DATABASE remove a base recém-criada.
 * A causa original é sempre a que se propaga; se a limpeza também falhar,
 * ambas são reportadas juntas (AggregateError, original primeiro).
 */
async function openMigratedOrCleanUp(input: {
  readonly name: string;
  readonly options: DisposableDatabaseOptions;
}): Promise<DisposableTestDatabase> {
  const { name, options } = input;
  const url = withDatabase(ADMIN_URL, name);
  try {
    assertDisposableDatabaseUrl(url);
    await (options.runMigrationsFn ?? runMigrations)({ connectionString: url });
    const { db, pool } = createDatabaseConnection({ connectionString: url, maxConnections: 6 });
    return { name, url, db, drop: () => dropDisposable({ name, close: () => pool.end() }) };
  } catch (original) {
    try {
      await dropDisposable({ name, close: async () => undefined });
    } catch (cleanupError) {
      throw new AggregateError(
        [original, cleanupError],
        'Disposable database setup failed and cleanup failed.',
      );
    }
    throw original;
  }
}

/** Só remove bases descartáveis criadas por ESTE processo (nunca bases alheias). */
export function assertDroppableByThisRun(name: string): void {
  if (!isDisposableDatabaseName(name) || !createdByThisRun.has(name)) {
    throw new Error('Refusing to drop a database not created by this test run.');
  }
}

async function dropDisposable(input: {
  readonly name: string;
  readonly close: () => Promise<void>;
}) {
  await input.close();
  assertDroppableByThisRun(input.name);
  const admin = createDatabaseConnection({ connectionString: ADMIN_URL, maxConnections: 1 });
  try {
    await waitForDatabaseDrain(admin.db, input.name);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS "${input.name}" WITH (FORCE)`));
    const left = await admin.db.execute(
      sql`SELECT 1 FROM pg_database WHERE datname = ${input.name}`,
    );
    if (left.rows.length > 0) throw new Error('Disposable database still present after drop.');
    createdByThisRun.delete(input.name);
  } finally {
    await admin.pool.end();
    // Só após a prova de posse (base criada por ESTE processo, que detém o lease).
    await releaseDisposableDatabaseLease();
  }
}
