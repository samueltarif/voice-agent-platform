import type { OutboundAttempt } from './outbound-attempt.js';
import { outboundAttemptEventSchema, type OutboundAttemptEvent } from './outbound-attempt-event.js';
import { buildNextAttempt } from './outbound-attempt-event-effects.js';
import {
  checkConsistency,
  checkCorrelation,
  type OutboundAttemptRejectionReason,
} from './outbound-attempt-event-guards.js';
import { isTerminalAttemptState } from './outbound-attempt-state.js';
import { OUTBOUND_ATTEMPT_TRANSITIONS } from './outbound-attempt-transitions.js';

export type { OutboundAttemptRejectionReason };

/**
 * APPLIED    transição aplicada; `attempt` é a nova versão.
 * DUPLICATE  mesmo eventId já aplicado; nada muda.
 * STALE      evento atrasado/repetido de passo já superado; ignorado sem erro.
 * REJECTED   evento inválido, de outro escopo ou conflitante; nada muda.
 */
export type ApplyOutboundAttemptEventResult =
  | { readonly kind: 'APPLIED'; readonly attempt: OutboundAttempt }
  | { readonly kind: 'DUPLICATE'; readonly attempt: OutboundAttempt }
  | { readonly kind: 'STALE'; readonly attempt: OutboundAttempt }
  | {
      readonly kind: 'REJECTED';
      readonly attempt: OutboundAttempt;
      readonly reason: OutboundAttemptRejectionReason;
    };

function reject(
  attempt: OutboundAttempt,
  reason: OutboundAttemptRejectionReason,
): ApplyOutboundAttemptEventResult {
  return { kind: 'REJECTED', attempt, reason };
}

function resolveTransition(
  attempt: OutboundAttempt,
  event: OutboundAttemptEvent,
): ApplyOutboundAttemptEventResult {
  const transition = OUTBOUND_ATTEMPT_TRANSITIONS[event.type];
  if (transition.from.has(attempt.state)) {
    return { kind: 'APPLIED', attempt: buildNextAttempt(attempt, event, transition.to) };
  }
  if (transition.stale.has(attempt.state)) return { kind: 'STALE', attempt };
  const reason = isTerminalAttemptState(attempt.state)
    ? 'TERMINAL_STATE_CONFLICT'
    : 'INVALID_TRANSITION';
  return reject(attempt, reason);
}

/**
 * Função pura: sem relógio, banco, rede ou aleatoriedade. Entrada `unknown`
 * porque eventos podem vir de camadas não confiáveis (validada por Zod).
 */
export function applyOutboundAttemptEvent(
  attempt: OutboundAttempt,
  rawEvent: unknown,
): ApplyOutboundAttemptEventResult {
  const parsed = outboundAttemptEventSchema.safeParse(rawEvent);
  if (!parsed.success) return reject(attempt, 'INVALID_EVENT');
  const event = parsed.data;
  const correlation = checkCorrelation(attempt, event);
  if (correlation) return reject(attempt, correlation);
  if (attempt.appliedEventIds.includes(event.eventId)) return { kind: 'DUPLICATE', attempt };
  const inconsistency = checkConsistency(attempt, event);
  if (inconsistency) return reject(attempt, inconsistency);
  return resolveTransition(attempt, event);
}
