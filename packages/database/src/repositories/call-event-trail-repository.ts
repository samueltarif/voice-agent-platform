import { and, asc, eq } from 'drizzle-orm';
import { applyOutboundAttemptEvent, type OutboundAttempt } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { callAttempts } from '../schema/call-attempts.js';
import { callEvents, type CallEventEntity } from '../schema/call-events.js';
import { toOutboundAttempt } from './call-attempt-mapping.js';

export type CallEventTrailEntry = Pick<
  CallEventEntity,
  | 'sequence'
  | 'eventId'
  | 'eventType'
  | 'attributes'
  | 'applicationResult'
  | 'rejectionReason'
  | 'occurredAt'
  | 'receivedAt'
  | 'callSessionId'
>;

export interface RebuiltAttempt {
  readonly attempt: OutboundAttempt;
  readonly replayedEvents: number;
}

const TRAIL_COLUMNS = {
  sequence: callEvents.sequence,
  eventId: callEvents.eventId,
  eventType: callEvents.eventType,
  attributes: callEvents.attributes,
  applicationResult: callEvents.applicationResult,
  rejectionReason: callEvents.rejectionReason,
  occurredAt: callEvents.occurredAt,
  receivedAt: callEvents.receivedAt,
  callSessionId: callEvents.callSessionId,
};

/**
 * Leitura da trilha append-only (ordem determinística por `sequence`) e
 * reconstrução do estado da tentativa reaplicando os eventos APPLIED na FSM
 * pura — sem nenhum efeito externo.
 */
export class DrizzleCallEventTrailRepository {
  constructor(private readonly db: DatabaseInstance) {}

  listByAttempt(scope: { readonly organizationId: string; readonly attemptId: string }) {
    return this.db
      .select(TRAIL_COLUMNS)
      .from(callEvents)
      .where(
        and(
          eq(callEvents.organizationId, scope.organizationId),
          eq(callEvents.attemptId, scope.attemptId),
        ),
      )
      .orderBy(asc(callEvents.sequence));
  }

  listBySession(scope: { readonly organizationId: string; readonly sessionId: string }) {
    return this.db
      .select(TRAIL_COLUMNS)
      .from(callEvents)
      .where(
        and(
          eq(callEvents.organizationId, scope.organizationId),
          eq(callEvents.callSessionId, scope.sessionId),
        ),
      )
      .orderBy(asc(callEvents.sequence));
  }

  async rebuildAttempt(scope: {
    readonly organizationId: string;
    readonly attemptId: string;
  }): Promise<RebuiltAttempt | null> {
    const [row] = await this.db
      .select()
      .from(callAttempts)
      .where(
        and(
          eq(callAttempts.id, scope.attemptId),
          eq(callAttempts.organizationId, scope.organizationId),
        ),
      );
    if (!row) return null;
    const trail = await this.listByAttempt(scope);
    let attempt = initialAttemptOf(toOutboundAttempt(row, []));
    const applied = trail.filter((entry) => entry.applicationResult === 'APPLIED');
    for (const entry of applied) {
      const result = applyOutboundAttemptEvent(attempt, toReplayEvent(row, entry));
      if (result.kind !== 'APPLIED') throw new Error(`Trail replay diverged at ${entry.sequence}.`);
      attempt = result.attempt;
    }
    return { attempt, replayedEvents: applied.length };
  }
}

function toReplayEvent(
  row: { readonly id: string; readonly organizationId: string; readonly jobId: string },
  entry: CallEventTrailEntry,
): Record<string, unknown> {
  return {
    eventId: entry.eventId,
    organizationId: row.organizationId,
    attemptId: row.id,
    jobId: row.jobId,
    occurredAt: (entry.occurredAt ?? entry.receivedAt).toISOString(),
    type: entry.eventType,
    ...(entry.callSessionId ? { callSessionId: entry.callSessionId } : {}),
    ...entry.attributes,
  };
}

/** Estado inicial (CREATED) com a identidade imutável persistida. */
function initialAttemptOf(current: OutboundAttempt): OutboundAttempt {
  return {
    ...current,
    state: 'CREATED',
    originationAuthorityId: null,
    providerReference: null,
    callSessionId: null,
    reconciliationAttempts: 0,
    requiresManualReview: false,
    appliedEventIds: [],
    lastEventAt: null,
  };
}
