import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { contactSuppressions } from '../schema/contacts.js';
import { outboundCallJobs } from '../schema/outbound.js';
import type { CallAttemptEntity } from '../schema/call-attempts.js';
import type { DatabaseExecutor } from './database-executor.js';
import { applyAttemptEventInTransaction } from './durable-attempt-event-applier.js';
import { buildInternalAttemptEvent } from './durable-attempt-event-factory.js';

/**
 * 008-MVP1 — última barreira antes do efeito externo: o destino do job da
 * tentativa é revalidado contra supressões DENTRO da transação do claim de
 * envio (cobre supressões registradas depois da criação do job).
 */
export async function isAttemptDestinationSuppressed(
  executor: DatabaseExecutor,
  row: CallAttemptEntity,
): Promise<boolean> {
  const [hit] = await executor
    .select({ hit: sql<number>`1` })
    .from(outboundCallJobs)
    .innerJoin(
      contactSuppressions,
      and(
        eq(contactSuppressions.organizationId, outboundCallJobs.organizationId),
        eq(contactSuppressions.phoneE164, outboundCallJobs.destinationPhone),
      ),
    )
    .where(
      and(
        eq(outboundCallJobs.id, row.jobId),
        eq(outboundCallJobs.organizationId, row.organizationId),
      ),
    )
    .limit(1);
  return hit !== undefined;
}

/** Cancela a tentativa (nada foi enviado): orçamento passa a ser liberável com prova. */
export async function cancelSuppressedAttempt(
  executor: DatabaseExecutor,
  row: CallAttemptEntity,
  now: Date,
): Promise<void> {
  const event = buildInternalAttemptEvent({
    attempt: { id: row.id, organizationId: row.organizationId, jobId: row.jobId },
    type: 'CANCEL_REQUESTED',
    eventId: randomUUID(),
    now,
  });
  await applyAttemptEventInTransaction(executor, {
    organizationId: row.organizationId,
    attemptId: row.id,
    event,
    now,
  });
}
