import { sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './database-executor.js';

/**
 * 008-MVP1 — serializa, por (tenant, E.164), o registro de supressão e a
 * decisão de envio (`claimSend`). Advisory lock TRANSACIONAL: liberado no
 * commit/rollback, nunca fica preso. Resultado linearizável: ou o claim vê a
 * supressão, ou a supressão só é confirmada depois do SEND_STARTED.
 * Colisões de hash apenas serializam mais; nunca liberam envio indevido.
 */
export async function lockSuppressionKey(
  executor: DatabaseExecutor,
  organizationId: string,
  phoneE164: string,
): Promise<void> {
  await executor.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId} || ':' || ${phoneE164}, 0))`,
  );
}
