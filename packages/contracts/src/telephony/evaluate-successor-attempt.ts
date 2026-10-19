import type { OutboundAttempt } from './outbound-attempt.js';
import type { OutboundAttemptState } from './outbound-attempt-state.js';
import { UNRESOLVED_OUTCOME_ATTEMPT_STATES } from './outbound-attempt-state.js';

export interface SuccessorAttemptScope {
  readonly organizationId: string;
  readonly jobId: string;
  readonly maxAttempts: number;
}

export type SuccessorAttemptBlockReason =
  | 'HISTORY_SCOPE_MISMATCH'
  | 'HISTORY_INCONSISTENT'
  | 'OUTCOME_UNKNOWN_BLOCKS_REDIAL'
  | 'ACTIVE_ATTEMPT_IN_PROGRESS'
  | 'MAX_ATTEMPTS_REACHED'
  | 'PREVIOUS_ATTEMPT_NOT_RETRYABLE';

export type SuccessorAttemptDecision =
  | { readonly allowed: true; readonly nextAttemptNumber: number }
  | { readonly allowed: false; readonly reason: SuccessorAttemptBlockReason };

/**
 * Únicos desfechos após os quais uma NOVA tentativa é segura: nenhuma chamada
 * foi criada (rejeição confirmada ou não-origem provada). CLOSED/CANCELED
 * exigem política de retentativa de slices futuras: aqui falham fechado.
 */
const RETRY_SAFE_STATES: ReadonlySet<OutboundAttemptState> = new Set([
  'ORIGINATION_REJECTED',
  'NOT_ORIGINATED',
]);

function isEndedOrCanceled(state: OutboundAttemptState): boolean {
  return state === 'CLOSED' || state === 'CANCELED';
}

const blocked = (reason: SuccessorAttemptBlockReason): SuccessorAttemptDecision => ({
  allowed: false,
  reason,
});

function isConsistent(sorted: readonly OutboundAttempt[]): boolean {
  const ids = new Set(sorted.map((attempt) => attempt.id));
  const sequential = sorted.every((attempt, index) => attempt.attemptNumber === index + 1);
  return sequential && ids.size === sorted.length;
}

/**
 * Decide se uma nova tentativa (NOVO id e NOVO attemptNumber) pode ser criada
 * para o job. Histórico anterior nunca é sobrescrito. Um desfecho desconhecido
 * bloqueia a rediscagem; o esgotamento de reconciliação NÃO a autoriza.
 */
export function evaluateSuccessorAttempt(
  history: readonly OutboundAttempt[],
  scope: SuccessorAttemptScope,
): SuccessorAttemptDecision {
  const inScope = history.every(
    (a) => a.organizationId === scope.organizationId && a.jobId === scope.jobId,
  );
  if (!inScope) return blocked('HISTORY_SCOPE_MISMATCH');

  const sorted = [...history].sort((a, b) => a.attemptNumber - b.attemptNumber);
  if (!isConsistent(sorted)) return blocked('HISTORY_INCONSISTENT');

  if (sorted.some((a) => UNRESOLVED_OUTCOME_ATTEMPT_STATES.has(a.state))) {
    return blocked('OUTCOME_UNKNOWN_BLOCKS_REDIAL');
  }
  if (sorted.some((a) => !RETRY_SAFE_STATES.has(a.state) && !isEndedOrCanceled(a.state))) {
    return blocked('ACTIVE_ATTEMPT_IN_PROGRESS');
  }
  if (sorted.length >= scope.maxAttempts) return blocked('MAX_ATTEMPTS_REACHED');
  if (sorted.some((a) => !RETRY_SAFE_STATES.has(a.state))) {
    return blocked('PREVIOUS_ATTEMPT_NOT_RETRYABLE');
  }
  return { allowed: true, nextAttemptNumber: sorted.length + 1 };
}
