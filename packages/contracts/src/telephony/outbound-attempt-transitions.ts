import type { OutboundAttemptEventType } from './outbound-attempt-event.js';
import type { OutboundAttemptState } from './outbound-attempt-state.js';

/**
 * Tabela determinística de transições de tentativa.
 * - `from`: estados em que o evento produz a transição para `to`.
 * - `stale`: estados em que o evento é uma repetição/atraso inofensivo
 *   (o passo já foi superado) e deve ser ignorado sem erro.
 * Qualquer outra combinação é inválida (ou conflito, se o estado é terminal).
 */
export interface AttemptTransitionRule {
  readonly from: ReadonlySet<OutboundAttemptState>;
  readonly to: OutboundAttemptState;
  readonly stale: ReadonlySet<OutboundAttemptState>;
}

type S = OutboundAttemptState;

function rule(from: readonly S[], to: S, stale: readonly S[]): AttemptTransitionRule {
  return { from: new Set(from), to, stale: new Set(stale) };
}

const RESOLVED: readonly S[] = [
  'ORIGINATION_ACCEPTED',
  'ORIGINATION_REJECTED',
  'NOT_ORIGINATED',
  'CLOSED',
];
const UNRESOLVED: readonly S[] = ['OUTCOME_UNKNOWN', 'RECONCILIATION_PENDING'];

export const OUTBOUND_ATTEMPT_TRANSITIONS: Readonly<
  Record<OutboundAttemptEventType, AttemptTransitionRule>
> = {
  INTENT_RECORDED: rule(['CREATED'], 'ORIGINATION_PENDING', [
    'ORIGINATION_SENT',
    ...UNRESOLVED,
    ...RESOLVED,
  ]),
  SEND_STARTED: rule(['ORIGINATION_PENDING'], 'ORIGINATION_SENT', [
    ...UNRESOLVED,
    ...RESOLVED,
    'ORIGINATION_SENT',
  ]),
  ORIGINATION_ACCEPTED: rule(['ORIGINATION_SENT', ...UNRESOLVED], 'ORIGINATION_ACCEPTED', [
    'ORIGINATION_ACCEPTED',
    'CLOSED',
  ]),
  ORIGINATION_REJECTED: rule(['ORIGINATION_SENT', ...UNRESOLVED], 'ORIGINATION_REJECTED', [
    'ORIGINATION_REJECTED',
  ]),
  ORIGINATION_RESULT_UNKNOWN: rule(['ORIGINATION_SENT'], 'OUTCOME_UNKNOWN', [
    ...UNRESOLVED,
    ...RESOLVED,
  ]),
  CRASH_RECOVERY_DETECTED: rule(['ORIGINATION_SENT'], 'OUTCOME_UNKNOWN', [
    ...UNRESOLVED,
    ...RESOLVED,
  ]),
  RECONCILIATION_REQUESTED: rule(['OUTCOME_UNKNOWN'], 'RECONCILIATION_PENDING', [
    'RECONCILIATION_PENDING',
    'ORIGINATION_ACCEPTED',
    'ORIGINATION_REJECTED',
    'NOT_ORIGINATED',
    'CLOSED',
  ]),
  RECONCILIATION_CONFIRMED_ORIGINATED: rule(UNRESOLVED, 'ORIGINATION_ACCEPTED', [
    'ORIGINATION_ACCEPTED',
    'CLOSED',
  ]),
  RECONCILIATION_CONFIRMED_NOT_ORIGINATED: rule(UNRESOLVED, 'NOT_ORIGINATED', ['NOT_ORIGINATED']),
  RECONCILIATION_INCONCLUSIVE: rule(['RECONCILIATION_PENDING'], 'OUTCOME_UNKNOWN', [
    'OUTCOME_UNKNOWN',
    ...RESOLVED,
  ]),
  RECONCILIATION_TIMED_OUT: rule(UNRESOLVED, 'OUTCOME_UNKNOWN', RESOLVED),
  CALL_CLOSED_CONFIRMED: rule(
    ['ORIGINATION_SENT', 'ORIGINATION_ACCEPTED', ...UNRESOLVED],
    'CLOSED',
    ['CLOSED'],
  ),
  CANCEL_REQUESTED: rule(['CREATED', 'ORIGINATION_PENDING'], 'CANCELED', ['CANCELED']),
};
