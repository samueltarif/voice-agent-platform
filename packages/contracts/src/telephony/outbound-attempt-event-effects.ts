import type { OutboundAttempt } from './outbound-attempt.js';
import type { OutboundAttemptEvent } from './outbound-attempt-event.js';
import type { OutboundAttemptState } from './outbound-attempt-state.js';
import { canBindSession } from './outbound-attempt-event-guards.js';

function laterOf(current: string | null, candidate: string): string {
  if (current === null) return candidate;
  return Date.parse(candidate) >= Date.parse(current) ? candidate : current;
}

function specificEffects(
  attempt: OutboundAttempt,
  event: OutboundAttemptEvent,
): Partial<OutboundAttempt> {
  switch (event.type) {
    case 'SEND_STARTED':
      return { originationAuthorityId: event.authorityId };
    case 'ORIGINATION_ACCEPTED':
    case 'RECONCILIATION_CONFIRMED_ORIGINATED':
      return { providerReference: event.providerReference ?? attempt.providerReference };
    case 'RECONCILIATION_INCONCLUSIVE':
      return { reconciliationAttempts: attempt.reconciliationAttempts + 1 };
    case 'RECONCILIATION_TIMED_OUT':
      return { requiresManualReview: true };
    default:
      return {};
  }
}

/** Produz a nova tentativa (imutável) após um evento aplicado com sucesso. */
export function buildNextAttempt(
  attempt: OutboundAttempt,
  event: OutboundAttemptEvent,
  nextState: OutboundAttemptState,
): OutboundAttempt {
  const bindsSession = canBindSession(event) && attempt.callSessionId === null;
  return {
    ...attempt,
    ...specificEffects(attempt, event),
    state: nextState,
    callSessionId: bindsSession ? (event.callSessionId ?? null) : attempt.callSessionId,
    appliedEventIds: [...attempt.appliedEventIds, event.eventId],
    lastEventAt: laterOf(attempt.lastEventAt, event.occurredAt),
  };
}
