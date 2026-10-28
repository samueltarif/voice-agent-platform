import { randomUUID } from 'node:crypto';
import type { OutboundAttemptState } from '@voice-agent/contracts';
import type { DatabaseExecutor } from './database-executor.js';
import { applyAttemptEventInTransaction, lockAttemptRow } from './durable-attempt-event-applier.js';
import { buildInternalAttemptEvent } from './durable-attempt-event-factory.js';

/** Estados terminais que PROVAM que nenhuma chamada foi criada. */
const PROVEN_NOT_SENT: ReadonlySet<OutboundAttemptState> = new Set([
  'ORIGINATION_REJECTED',
  'NOT_ORIGINATED',
  'CANCELED',
]);

/** Estados em que nada foi enviado e o cancelamento atômico impede envio futuro. */
const CANCELABLE_BEFORE_SEND: ReadonlySet<OutboundAttemptState> = new Set([
  'CREATED',
  'ORIGINATION_PENDING',
]);

export type NotSentEvidence =
  | { readonly proven: true }
  | { readonly proven: false; readonly attemptState: OutboundAttemptState | 'NOT_FOUND' };

interface EvidenceInput {
  readonly organizationId: string;
  readonly attemptId: string;
  readonly now: Date;
}

/**
 * Liberar orçamento/capacidade exige evidência de NÃO envio (008-OF3, item D).
 * Deve rodar na MESMA transação da liberação, com a reserva já travada:
 * - terminal sem chamada → liberável;
 * - antes do envio → a tentativa é CANCELADA atomicamente, de modo que um
 *   `claimSend` concorrente posterior a encontre terminal e nunca origine sem
 *   fundos encumberados;
 * - enviada, aceita, incerta ou encerrada → bloqueio (fail-closed).
 */
export async function proveAttemptNotSent(
  tx: DatabaseExecutor,
  input: EvidenceInput,
): Promise<NotSentEvidence> {
  const row = await lockAttemptRow(tx, input);
  if (!row) return { proven: false, attemptState: 'NOT_FOUND' };
  if (PROVEN_NOT_SENT.has(row.state)) return { proven: true };
  if (!CANCELABLE_BEFORE_SEND.has(row.state)) return { proven: false, attemptState: row.state };

  const event = buildInternalAttemptEvent({
    attempt: { id: row.id, organizationId: row.organizationId, jobId: row.jobId },
    type: 'CANCEL_REQUESTED',
    eventId: randomUUID(),
    now: input.now,
  });
  const outcome = await applyAttemptEventInTransaction(tx, { ...input, event });
  const canceled =
    (outcome.kind === 'APPLIED' || outcome.kind === 'STALE') &&
    outcome.record.attempt.state === 'CANCELED';
  return canceled ? { proven: true } : { proven: false, attemptState: row.state };
}
