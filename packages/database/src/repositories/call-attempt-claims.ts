import {
  originationEventOf,
  reconciliationEventOf,
  type TelephonyOriginationResult,
  type TelephonyReconciliationResult,
} from '@voice-agent/contracts';
import type { DatabaseExecutor } from './database-executor.js';
import type { DurableAttemptRecord } from './call-attempt-mapping.js';
import {
  applyAttemptEventInTransaction,
  lockAttemptRow,
  type AttemptFence,
  type DurableApplyOutcome,
} from './durable-attempt-event-applier.js';
import { buildInternalAttemptEvent } from './durable-attempt-event-factory.js';
import {
  cancelSuppressedAttempt,
  isAttemptDestinationSuppressed,
} from './send-time-suppression-guard.js';

export interface ClaimInput {
  readonly organizationId: string;
  readonly attemptId: string;
  readonly ownerId: string;
  readonly leaseMs: number;
  readonly eventId: string;
  readonly now: Date;
}

export type ClaimRejectionReason =
  | 'NOT_FOUND'
  | 'NOT_CLAIMABLE_IN_STATE'
  | 'CLAIM_HELD_BY_ANOTHER_OWNER'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'DESTINATION_SUPPRESSED'
  | 'CLAIM_TRANSITION_REJECTED';

export type ClaimResult =
  | {
      readonly kind: 'CLAIMED';
      readonly fence: AttemptFence;
      readonly record: DurableAttemptRecord;
    }
  | { readonly kind: 'REJECTED'; readonly reason: ClaimRejectionReason };

export interface CompleteInput<TResult> {
  readonly organizationId: string;
  readonly attemptId: string;
  readonly fence: AttemptFence;
  readonly result: TResult;
  readonly eventId: string;
  readonly now: Date;
}

const RELEASE_CLAIM = { claimOwner: null, leaseExpiresAt: null } as const;

function claimed(outcome: DurableApplyOutcome, fence: AttemptFence): ClaimResult {
  if (outcome.kind === 'APPLIED' || outcome.kind === 'STALE') {
    return { kind: 'CLAIMED', fence, record: outcome.record };
  }
  return { kind: 'REJECTED', reason: 'CLAIM_TRANSITION_REJECTED' };
}

/**
 * Claim exclusivo de ENVIO: só a partir de ORIGINATION_PENDING e com
 * SEND_STARTED gravado na mesma transação, ANTES de qualquer chamada à porta.
 * O efeito externo acontece fora da transação. Lease expirado após o envio
 * nunca reabre o envio: só a recuperação pode tratá-lo (como OUTCOME_UNKNOWN).
 */
export async function claimSendInTransaction(
  executor: DatabaseExecutor,
  input: ClaimInput,
): Promise<ClaimResult> {
  const row = await lockAttemptRow(executor, input);
  if (!row) return { kind: 'REJECTED', reason: 'NOT_FOUND' };
  if (row.state !== 'ORIGINATION_PENDING') {
    return { kind: 'REJECTED', reason: 'NOT_CLAIMABLE_IN_STATE' };
  }
  if (await isAttemptDestinationSuppressed(executor, row)) {
    await cancelSuppressedAttempt(executor, row, input.now);
    return { kind: 'REJECTED', reason: 'DESTINATION_SUPPRESSED' };
  }
  const fence = { ownerId: input.ownerId, fencingToken: row.fencingToken + 1 };
  const event = buildInternalAttemptEvent({
    attempt: { id: row.id, organizationId: row.organizationId, jobId: row.jobId },
    type: 'SEND_STARTED',
    eventId: input.eventId,
    now: input.now,
    extra: { authorityId: input.ownerId },
  });
  const outcome = await applyAttemptEventInTransaction(executor, {
    ...input,
    event,
    patch: {
      claimOwner: input.ownerId,
      fencingToken: fence.fencingToken,
      leaseExpiresAt: new Date(input.now.getTime() + input.leaseMs),
      sendStartedAt: input.now,
    },
  });
  return outcome.kind === 'APPLIED' ? claimed(outcome, fence) : rejectedClaim(outcome);
}

function rejectedClaim(_outcome: DurableApplyOutcome): ClaimResult {
  return { kind: 'REJECTED', reason: 'CLAIM_TRANSITION_REJECTED' };
}

/** Finaliza o envio: exige o MESMO dono e fencing token (escritor antigo é barrado). */
export function completeOriginationInTransaction(
  executor: DatabaseExecutor,
  input: CompleteInput<TelephonyOriginationResult>,
): Promise<DurableApplyOutcome> {
  const mapped = originationEventOf(input.result);
  return applyFencedEvent(executor, { input, type: mapped.type, extra: mapped.extra });
}

export function completeReconciliationInTransaction(
  executor: DatabaseExecutor,
  input: CompleteInput<TelephonyReconciliationResult>,
): Promise<DurableApplyOutcome> {
  const mapped = reconciliationEventOf(input.result);
  return applyFencedEvent(executor, { input, type: mapped.type, extra: mapped.extra });
}

async function applyFencedEvent(
  executor: DatabaseExecutor,
  ctx: {
    readonly input: CompleteInput<unknown>;
    readonly type: Parameters<typeof buildInternalAttemptEvent>[0]['type'];
    readonly extra: Readonly<Record<string, unknown>>;
  },
): Promise<DurableApplyOutcome> {
  const { input } = ctx;
  const row = await lockAttemptRow(executor, input);
  if (!row) return { kind: 'NOT_FOUND' };
  const event = buildInternalAttemptEvent({
    attempt: { id: row.id, organizationId: row.organizationId, jobId: row.jobId },
    type: ctx.type,
    eventId: input.eventId,
    now: input.now,
    extra: ctx.extra,
  });
  return applyAttemptEventInTransaction(executor, {
    organizationId: input.organizationId,
    attemptId: input.attemptId,
    event,
    now: input.now,
    fence: input.fence,
    patch: RELEASE_CLAIM,
  });
}
