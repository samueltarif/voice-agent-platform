import { sql } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';

/**
 * Limite explícito da espera: com encerramento normal as conexões somem em
 * milissegundos (medido: até dezenas de ms após `pool.end()`); 5 s cobre
 * hosts lentos (Docker Desktop/WSL2) dentro do limite de 10 s dos hooks.
 */
export const DATABASE_DRAIN_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 25;

/**
 * Aguarda o servidor não ter mais backends na base antes do DROP. O driver
 * `pg` resolve `pool.end()` antes de os sockets fecharem; derrubar essas
 * conexões com `WITH (FORCE)` gera erros 57P01 sem listener. Ao expirar, o
 * chamador mantém o `FORCE` como último recurso (nunca deixa a base órfã).
 */
export async function waitForDatabaseDrain(
  admin: DatabaseInstance,
  databaseName: string,
  timeoutMs: number = DATABASE_DRAIN_TIMEOUT_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await admin.execute<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM pg_stat_activity WHERE datname = ${databaseName}`,
    );
    if ((result.rows[0]?.total ?? 0) === 0) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
