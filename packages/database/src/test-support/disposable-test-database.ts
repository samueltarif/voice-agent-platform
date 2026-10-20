import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createDatabaseConnection, type DatabaseInstance } from '../client/connection.js';
import { runMigrations } from '../client/migrate.js';

/**
 * Banco PostgreSQL DESCARTÁVEL por suíte (008-OF2). Nunca usa `DATABASE_URL`:
 * o servidor administrativo vem só de `TEST_DATABASE_URL` ou do padrão local
 * do repositório, e toda DDL/limpeza acontece numa base nova, criada por este
 * processo com nome único `of2_test_<hex>` e removida inteira ao final.
 * Nenhuma connection string é impressa.
 */
const ADMIN_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const NAME_PATTERN = /^of2_test_[0-9a-f]{12}$/;
export const DISPOSABLE_DB_URL_ENV = 'DURABLE_OUTBOUND_DISPOSABLE_DATABASE_URL';

export interface DisposableTestDatabase {
  readonly name: string;
  readonly url: string;
  readonly db: DatabaseInstance;
  drop(): Promise<void>;
}

export function assertLocalDatabaseUrl(connectionString: string): void {
  if (!LOCAL_HOSTS.has(new URL(connectionString).hostname)) {
    throw new Error('Refusing to run durable outbound tests against a non-local database.');
  }
}

/** Prova adicional pelo próprio servidor: o endereço da conexão é loopback (ou socket). */
async function assertLoopbackServer(db: DatabaseInstance): Promise<void> {
  const result = await db.execute<{ addr: string | null }>(
    sql`SELECT host(inet_server_addr()) AS addr`,
  );
  const addr = result.rows[0]?.addr ?? null;
  if (addr !== null && addr !== '127.0.0.1' && addr !== '::1') {
    throw new Error('Refusing to use a PostgreSQL server that is not on loopback.');
  }
}

function withDatabase(url: string, name: string): string {
  const target = new URL(url);
  target.pathname = `/${name}`;
  return target.toString();
}

export function assertDisposableDatabaseUrl(url: string): void {
  assertLocalDatabaseUrl(url);
  if (!NAME_PATTERN.test(new URL(url).pathname.slice(1))) {
    throw new Error('Refusing a database that was not created as disposable for this test run.');
  }
}

export async function createDisposableTestDatabase(tag: string): Promise<DisposableTestDatabase> {
  assertLocalDatabaseUrl(ADMIN_URL);
  const admin = createDatabaseConnection({ connectionString: ADMIN_URL, maxConnections: 1 });
  const name = `of2_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  try {
    await assertLoopbackServer(admin.db);
    await admin.db.execute(sql.raw(`CREATE DATABASE "${name}"`));
  } finally {
    await admin.pool.end();
  }
  const url = withDatabase(ADMIN_URL, name);
  assertDisposableDatabaseUrl(url);
  await runMigrations({ connectionString: url });
  const { db, pool } = createDatabaseConnection({ connectionString: url, maxConnections: 6 });
  await assertLoopbackServer(db);
  void tag;
  return { name, url, db, drop: () => dropDisposable({ name, close: () => pool.end() }) };
}

async function dropDisposable(input: {
  readonly name: string;
  readonly close: () => Promise<void>;
}) {
  await input.close();
  if (!NAME_PATTERN.test(input.name))
    throw new Error('Refusing to drop a non-disposable database.');
  const admin = createDatabaseConnection({ connectionString: ADMIN_URL, maxConnections: 1 });
  try {
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS "${input.name}" WITH (FORCE)`));
    const left = await admin.db.execute(
      sql`SELECT 1 FROM pg_database WHERE datname = ${input.name}`,
    );
    if (left.rows.length > 0) throw new Error('Disposable database still present after drop.');
  } finally {
    await admin.pool.end();
  }
}
