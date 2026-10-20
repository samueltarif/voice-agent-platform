import { and, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { callAttempts } from '../schema/call-attempts.js';
import type { DatabaseExecutor } from './database-executor.js';
import { applyAttemptEventInTransaction } from './durable-attempt-event-applier.js';
import { buildInternalAttemptEvent } from './durable-attempt-event-factory.js';

export interface RecoverInterruptedInput {
  readonly organizationId: string;
  readonly recoveryOwnerId: string;
  readonly now: Date;
  readonly limit: number;
  readonly newEventId: () => string;
}

export interface RecoveredAttempt {
  readonly attemptId: string;
  readonly previousState: 'ORIGINATION_SENT';
  readonly outcome: string;
  readonly state: string | null;
}

export interface RecoveryReport {
  readonly recoveryOwnerId: string;
  readonly recovered: readonly RecoveredAttempt[];
  /** Pré-envio: nada foi emitido; seguro e intocado. */
  readonly preSendUntouched: readonly string[];
  /** Desfecho já incerto: permanece bloqueado até reconciliação. */
  readonly unresolvedUntouched: readonly string[];
}

async function lockInterrupted(executor: DatabaseExecutor, input: RecoverInterruptedInput) {
  return executor
    .select()
    .from(callAttempts)
    .where(
      and(
        eq(callAttempts.organizationId, input.organizationId),
        eq(callAttempts.state, 'ORIGINATION_SENT'),
        or(isNull(callAttempts.leaseExpiresAt), lte(callAttempts.leaseExpiresAt, input.now)),
      ),
    )
    .orderBy(callAttempts.id)
    .limit(input.limit)
    .for('update', { skipLocked: true });
}

async function listIdsInStates(
  executor: DatabaseExecutor,
  organizationId: string,
  states: ('CREATED' | 'ORIGINATION_PENDING' | 'OUTCOME_UNKNOWN' | 'RECONCILIATION_PENDING')[],
): Promise<string[]> {
  const rows = await executor
    .select({ id: callAttempts.id })
    .from(callAttempts)
    .where(
      and(eq(callAttempts.organizationId, organizationId), inArray(callAttempts.state, states)),
    );
  return rows.map((row) => row.id);
}

/**
 * Recuperação offline e explicitamente invocável (não ligada ao runtime).
 * Política fail-closed: toda tentativa deixada em ORIGINATION_SENT com lease
 * expirado vira OUTCOME_UNKNOWN com NOVO fencing token (o emissor antigo não
 * consegue mais finalizar). Ausência de referência externa NÃO prova que não
 * houve chamada. SKIP LOCKED impede dois recuperadores no mesmo registro.
 */
export async function recoverInterruptedAttemptsInTransaction(
  executor: DatabaseExecutor,
  input: RecoverInterruptedInput,
): Promise<RecoveryReport> {
  const rows = await lockInterrupted(executor, input);
  const recovered: RecoveredAttempt[] = [];
  for (const row of rows) {
    const outcome = await applyAttemptEventInTransaction(executor, {
      organizationId: row.organizationId,
      attemptId: row.id,
      event: buildInternalAttemptEvent({
        attempt: row,
        type: 'CRASH_RECOVERY_DETECTED',
        eventId: input.newEventId(),
        now: input.now,
      }),
      now: input.now,
      patch: { claimOwner: null, leaseExpiresAt: null, fencingToken: row.fencingToken + 1 },
    });
    const state = 'record' in outcome ? outcome.record.attempt.state : null;
    recovered.push({
      attemptId: row.id,
      previousState: 'ORIGINATION_SENT',
      outcome: outcome.kind,
      state,
    });
  }
  return {
    recoveryOwnerId: input.recoveryOwnerId,
    recovered,
    preSendUntouched: await listIdsInStates(executor, input.organizationId, [
      'CREATED',
      'ORIGINATION_PENDING',
    ]),
    unresolvedUntouched: await listIdsInStates(executor, input.organizationId, [
      'OUTCOME_UNKNOWN',
      'RECONCILIATION_PENDING',
    ]).then((ids) => ids.filter((id) => !recovered.some((r) => r.attemptId === id))),
  };
}
