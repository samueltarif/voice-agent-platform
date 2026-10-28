import type pg from 'pg';
import { createDatabaseConnection } from '../client/connection.js';

/**
 * Lease EXCLUSIVO entre processos de teste para o ciclo de vida de bancos
 * descartáveis (CREATE → testes → DROP). Motivo medido: no PostgreSQL 16 cada
 * `DROP DATABASE` força um checkpoint imediato e espera seu término; com
 * várias suítes descartáveis em paralelo esse checkpoint faz fsync dos
 * arquivos sujos de TODAS elas, e em hosts de fsync lento (Docker
 * Desktop/WSL2) hooks e testes estouram seus limites. Em série tudo passa.
 *
 * Advisory lock de SESSÃO num cliente dedicado: liberado no último `release`
 * deste processo ou, se o processo morrer, pelo próprio servidor ao fechar a
 * conexão (nunca fica preso). Reentrante por contagem dentro do processo.
 */
const LEASE_KEYS = [0x56415030, 0x4f463254] as const; // 'VAP0', 'OF2T'

interface Lease {
  readonly pool: pg.Pool;
  readonly client: pg.PoolClient;
}

let lease: Promise<Lease> | null = null;
let holders = 0;

async function openLease(adminUrl: string): Promise<Lease> {
  const { pool } = createDatabaseConnection({ connectionString: adminUrl, maxConnections: 1 });
  const client = await pool.connect().catch(async (error: unknown) => {
    await pool.end();
    throw error;
  });
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [...LEASE_KEYS]);
    return { pool, client };
  } catch (error) {
    client.release();
    await pool.end();
    throw error;
  }
}

export async function acquireDisposableDatabaseLease(adminUrl: string): Promise<void> {
  holders += 1;
  lease ??= openLease(adminUrl);
  try {
    await lease;
  } catch (error) {
    holders -= 1;
    if (holders === 0) lease = null;
    throw error;
  }
}

export async function releaseDisposableDatabaseLease(): Promise<void> {
  if (holders === 0 || !lease) throw new Error('Disposable database lease is not held.');
  holders -= 1;
  if (holders > 0) return;
  const held = await lease;
  lease = null;
  try {
    await held.client.query('SELECT pg_advisory_unlock($1, $2)', [...LEASE_KEYS]);
  } finally {
    held.client.release();
    await held.pool.end();
  }
}

/** Apenas para a suíte de guarda comprovar exclusão entre sessões. */
export const DISPOSABLE_DATABASE_LEASE_KEYS = LEASE_KEYS;
