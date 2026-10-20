import type { CallAttemptEntity } from '../schema/call-attempts.js';
import type { DatabaseExecutor } from './database-executor.js';
import { applyAttemptEventInTransaction, lockAttemptRow } from './durable-attempt-event-applier.js';
import { buildInternalAttemptEvent } from './durable-attempt-event-factory.js';
import type { ClaimInput, ClaimRejectionReason, ClaimResult } from './call-attempt-claims.js';

function leaseExpired(row: CallAttemptEntity, now: Date): boolean {
  return row.leaseExpiresAt === null || row.leaseExpiresAt.getTime() <= now.getTime();
}

function reconciliationEligibility(row: CallAttemptEntity, now: Date): ClaimRejectionReason | null {
  if (row.requiresManualReview) return 'MANUAL_REVIEW_REQUIRED';
  if (row.state === 'OUTCOME_UNKNOWN') return null;
  if (row.state !== 'RECONCILIATION_PENDING') return 'NOT_CLAIMABLE_IN_STATE';
  return leaseExpired(row, now) ? null : 'CLAIM_HELD_BY_ANOTHER_OWNER';
}

/**
 * Claim de RECONCILIAÇÃO (consulta de desfecho, sem nova discagem). Permite
 * retomar um RECONCILIATION_PENDING cujo lease expirou (queda durante a
 * reconciliação), sempre com novo fencing token; o dono anterior é barrado.
 */
export async function claimReconciliationInTransaction(
  executor: DatabaseExecutor,
  input: ClaimInput,
): Promise<ClaimResult> {
  const row = await lockAttemptRow(executor, input);
  if (!row) return { kind: 'REJECTED', reason: 'NOT_FOUND' };
  const ineligible = reconciliationEligibility(row, input.now);
  if (ineligible) return { kind: 'REJECTED', reason: ineligible };
  const fence = { ownerId: input.ownerId, fencingToken: row.fencingToken + 1 };
  const event = buildInternalAttemptEvent({
    attempt: { id: row.id, organizationId: row.organizationId, jobId: row.jobId },
    type: 'RECONCILIATION_REQUESTED',
    eventId: input.eventId,
    now: input.now,
  });
  const outcome = await applyAttemptEventInTransaction(executor, {
    organizationId: input.organizationId,
    attemptId: input.attemptId,
    event,
    now: input.now,
    patchOnStale: true,
    patch: {
      claimOwner: input.ownerId,
      fencingToken: fence.fencingToken,
      leaseExpiresAt: new Date(input.now.getTime() + input.leaseMs),
      lastReconciliationAt: input.now,
    },
  });
  if (outcome.kind === 'APPLIED' || outcome.kind === 'STALE') {
    return { kind: 'CLAIMED', fence, record: outcome.record };
  }
  return { kind: 'REJECTED', reason: 'CLAIM_TRANSITION_REJECTED' };
}
