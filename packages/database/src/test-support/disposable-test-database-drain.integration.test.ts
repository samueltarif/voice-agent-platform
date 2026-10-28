import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection } from '../client/connection.js';
import {
  acquireDisposableDatabaseLease,
  releaseDisposableDatabaseLease,
} from './disposable-database-lease.js';
import { createDisposableTestDatabase } from './disposable-test-database.js';
import { resolveTestAdminUrl } from './test-database-target-evidence.js';

/**
 * Regressão (gate pós-merge da PR #125): `pool.end()` do driver `pg` resolve
 * ANTES de os sockets fecharem (medido: conexões ainda vivas no servidor em
 * 31/50 iterações). Um `DROP DATABASE ... WITH (FORCE)` nesse instante derruba
 * a conexão em encerramento (57P01) e o erro escapa sem listener. A remoção
 * precisa aguardar o servidor drenar as conexões da base antes do DROP.
 *
 * Bancos criados DENTRO do teste: lease obtido no carregamento (como na suíte
 * de guarda) para que a espera por outras suítes não consuma o timeout.
 */
await acquireDisposableDatabaseLease(resolveTestAdminUrl(process.env));

/** Atraso do encerramento simulado: modela um pool cujo shutdown ainda não terminou. */
const CLOSE_DELAY_MS = 300;

describe('disposable database drop waits for closing connections', () => {
  afterAll(async () => {
    await releaseDisposableDatabaseLease();
  });

  it('never terminates a connection whose pool is still shutting down', async () => {
    const terminated: unknown[] = [];
    const tdb = await createDisposableTestDatabase('drain');
    const extra = createDatabaseConnection({ connectionString: tdb.url, maxConnections: 1 });
    extra.pool.on('error', (error) => terminated.push(error));
    await extra.db.execute(sql`SELECT 1`);
    const closing = new Promise<void>((resolve) =>
      setTimeout(() => void extra.pool.end().then(resolve), CLOSE_DELAY_MS),
    );
    await tdb.drop();
    await closing;
    expect(terminated).toEqual([]);
  }, 30_000);
});
