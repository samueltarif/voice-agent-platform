import type { OutboundAttempt } from '@voice-agent/contracts';
import type { CallAttemptEntity } from '../schema/call-attempts.js';

/** Tentativa canônica (FSM 008-OF1) + metadados técnicos de concorrência. */
export interface DurableAttemptRecord {
  readonly attempt: OutboundAttempt;
  readonly stateVersion: number;
  readonly claimOwner: string | null;
  readonly fencingToken: number;
  readonly leaseExpiresAt: Date | null;
  readonly sendStartedAt: Date | null;
  readonly lastReconciliationAt: Date | null;
}

export function toOutboundAttempt(
  row: CallAttemptEntity,
  appliedEventIds: readonly string[],
): OutboundAttempt {
  return {
    id: row.id,
    organizationId: row.organizationId,
    jobId: row.jobId,
    campaignId: row.campaignId,
    attemptNumber: row.attemptNumber,
    correlationId: row.correlationId,
    agentId: row.agentId,
    agentVersionId: row.agentVersionId,
    idempotencyKey: row.idempotencyKey,
    state: row.state,
    originationAuthorityId: row.originationAuthorityId,
    providerReference: row.providerReference,
    callSessionId: row.callSessionId,
    reconciliationAttempts: row.reconciliationAttempts,
    requiresManualReview: row.requiresManualReview,
    appliedEventIds,
    lastEventAt: row.lastEventAt ? row.lastEventAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toDurableAttemptRecord(
  row: CallAttemptEntity,
  appliedEventIds: readonly string[],
): DurableAttemptRecord {
  return {
    attempt: toOutboundAttempt(row, appliedEventIds),
    stateVersion: row.stateVersion,
    claimOwner: row.claimOwner,
    fencingToken: row.fencingToken,
    leaseExpiresAt: row.leaseExpiresAt,
    sendStartedAt: row.sendStartedAt,
    lastReconciliationAt: row.lastReconciliationAt,
  };
}

/** Colunas derivadas da FSM; identidade nunca é reescrita (trigger no banco). */
export function attemptStateColumns(attempt: OutboundAttempt) {
  return {
    state: attempt.state,
    originationAuthorityId: attempt.originationAuthorityId,
    providerReference: attempt.providerReference,
    callSessionId: attempt.callSessionId,
    reconciliationAttempts: attempt.reconciliationAttempts,
    requiresManualReview: attempt.requiresManualReview,
    lastEventAt: attempt.lastEventAt ? new Date(attempt.lastEventAt) : null,
  };
}
