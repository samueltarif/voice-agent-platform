import type { OutboundAttempt } from './outbound-attempt.js';
import type { OutboundAttemptEvent } from './outbound-attempt-event.js';

export type OutboundAttemptRejectionReason =
  | 'INVALID_EVENT'
  | 'TENANT_MISMATCH'
  | 'ATTEMPT_MISMATCH'
  | 'JOB_MISMATCH'
  | 'SESSION_MISMATCH'
  | 'AUTHORITY_CONFLICT'
  | 'PROVIDER_REFERENCE_CONFLICT'
  | 'INVALID_TRANSITION'
  | 'TERMINAL_STATE_CONFLICT';

/** Eventos que podem vincular a tentativa a uma sessão (respostas da autoridade de originação). */
const SESSION_BINDING_EVENTS: ReadonlySet<OutboundAttemptEvent['type']> = new Set([
  'ORIGINATION_ACCEPTED',
  'RECONCILIATION_CONFIRMED_ORIGINATED',
  'CALL_CLOSED_CONFIRMED',
]);

export function canBindSession(event: OutboundAttemptEvent): boolean {
  return SESSION_BINDING_EVENTS.has(event.type);
}

/**
 * Isolamento por tenant/tentativa/job/sessão. Roda ANTES de qualquer outra
 * verificação para que um evento de outro escopo jamais altere (nem revele,
 * via DUPLICATE/STALE) o estado local.
 */
export function checkCorrelation(
  attempt: OutboundAttempt,
  event: OutboundAttemptEvent,
): OutboundAttemptRejectionReason | null {
  if (event.organizationId !== attempt.organizationId) return 'TENANT_MISMATCH';
  if (event.attemptId !== attempt.id) return 'ATTEMPT_MISMATCH';
  if (event.jobId !== attempt.jobId) return 'JOB_MISMATCH';
  const boundSession = attempt.callSessionId;
  if (boundSession !== null && event.callSessionId && event.callSessionId !== boundSession) {
    return 'SESSION_MISMATCH';
  }
  return null;
}

function checkAuthority(
  attempt: OutboundAttempt,
  authorityId: string,
): OutboundAttemptRejectionReason | null {
  const holder = attempt.originationAuthorityId;
  return holder !== null && holder !== authorityId ? 'AUTHORITY_CONFLICT' : null;
}

function checkProviderReference(
  attempt: OutboundAttempt,
  incoming: string | undefined,
): OutboundAttemptRejectionReason | null {
  const known = attempt.providerReference;
  return known !== null && incoming !== undefined && known !== incoming
    ? 'PROVIDER_REFERENCE_CONFLICT'
    : null;
}

/** Autoridade única de originação e consistência de referência externa. */
export function checkConsistency(
  attempt: OutboundAttempt,
  event: OutboundAttemptEvent,
): OutboundAttemptRejectionReason | null {
  switch (event.type) {
    case 'SEND_STARTED':
      return checkAuthority(attempt, event.authorityId);
    case 'ORIGINATION_ACCEPTED':
    case 'RECONCILIATION_CONFIRMED_ORIGINATED':
      return checkProviderReference(attempt, event.providerReference);
    default:
      return null;
  }
}
