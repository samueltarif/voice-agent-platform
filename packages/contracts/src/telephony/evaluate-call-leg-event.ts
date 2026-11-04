import { isCallLegStateAdvance, isTerminalCallLegState, type CallLeg } from './call-leg.js';
import type { CallLegStatusEvent } from './call-leg-events.js';
import {
  classifySecondProviderReference,
  type SecondReferenceAssessment,
} from './classify-second-provider-reference.js';

/**
 * 008-OF5a (S1) — Avaliação pura de um evento de perna já autenticado.
 * Regras: tenant e tentativa conferem; `HUMAN_AGENT_LEG` reservada; a perna do
 * agente exige a perna do contato conhecida como pai; no máximo UMA perna do
 * agente ativa; duplicatas são idempotentes; eventos atrasados nunca regridem.
 */
export type CallLegRejectionReason =
  | 'TENANT_OR_ATTEMPT_MISMATCH'
  | 'HUMAN_AGENT_LEG_RESERVED'
  | 'CONTACT_LEG_UNKNOWN'
  | 'PARENT_MISMATCH'
  | 'SECOND_ACTIVE_AI_AGENT_LEG';

export type CallLegEventDecision =
  | { readonly kind: 'APPLY'; readonly leg: CallLeg }
  | { readonly kind: 'DUPLICATE' }
  | { readonly kind: 'STALE' }
  | { readonly kind: 'REJECTED'; readonly reason: CallLegRejectionReason }
  | { readonly kind: 'SECOND_CONTACT_REFERENCE'; readonly assessment: SecondReferenceAssessment };

export interface CallLegEventInput {
  readonly organizationId: string;
  readonly attemptId: string;
  /** Referência da perna do contato já vinculada (`null` se ainda não houver). */
  readonly contactLegReference: string | null;
  readonly transferRecorded: boolean;
  readonly legs: readonly CallLeg[];
  readonly event: CallLegStatusEvent;
}

function toLeg(event: CallLegStatusEvent): CallLeg {
  return {
    organizationId: event.organizationId,
    attemptId: event.attemptId,
    role: event.role,
    providerLegReference: event.providerLegReference,
    parentLegReference: event.parentLegReference,
    state: event.state,
    lastSequence: event.sequence,
  };
}

function applyToLeg(
  existing: CallLeg | undefined,
  event: CallLegStatusEvent,
): CallLegEventDecision {
  if (!existing) return { kind: 'APPLY', leg: toLeg(event) };
  if (existing.state === event.state) return { kind: 'DUPLICATE' };
  const olderSequence =
    existing.lastSequence !== null &&
    event.sequence !== null &&
    event.sequence <= existing.lastSequence;
  if (olderSequence || !isCallLegStateAdvance(existing.state, event.state))
    return { kind: 'STALE' };
  return { kind: 'APPLY', leg: { ...existing, state: event.state, lastSequence: event.sequence } };
}

function evaluateContactLeg(input: CallLegEventInput, contactRef: string): CallLegEventDecision {
  const { event } = input;
  if (event.providerLegReference !== contactRef) {
    const assessment = classifySecondProviderReference({
      endpointRole: 'CONTACT_LEG',
      incomingReference: event.providerLegReference,
      boundContactReference: contactRef,
      parentReference: event.parentLegReference,
      transferRecorded: input.transferRecorded,
      operatorConfirmation: null,
    });
    return { kind: 'SECOND_CONTACT_REFERENCE', assessment };
  }
  const existing = input.legs.find((leg) => leg.role === 'CONTACT_LEG');
  return applyToLeg(existing, event);
}

function evaluateAiAgentLeg(input: CallLegEventInput, contactRef: string): CallLegEventDecision {
  const { event } = input;
  if (event.parentLegReference !== contactRef)
    return { kind: 'REJECTED', reason: 'PARENT_MISMATCH' };
  const aiLegs = input.legs.filter((leg) => leg.role === 'AI_AGENT_LEG');
  const existing = aiLegs.find((leg) => leg.providerLegReference === event.providerLegReference);
  const otherActive = aiLegs.some((leg) => leg !== existing && !isTerminalCallLegState(leg.state));
  if (!existing && otherActive) return { kind: 'REJECTED', reason: 'SECOND_ACTIVE_AI_AGENT_LEG' };
  return applyToLeg(existing, event);
}

export function evaluateCallLegStatusEvent(input: CallLegEventInput): CallLegEventDecision {
  const { event } = input;
  if (event.organizationId !== input.organizationId || event.attemptId !== input.attemptId) {
    return { kind: 'REJECTED', reason: 'TENANT_OR_ATTEMPT_MISMATCH' };
  }
  if (event.role === 'HUMAN_AGENT_LEG')
    return { kind: 'REJECTED', reason: 'HUMAN_AGENT_LEG_RESERVED' };
  if (input.contactLegReference === null)
    return { kind: 'REJECTED', reason: 'CONTACT_LEG_UNKNOWN' };
  return event.role === 'CONTACT_LEG'
    ? evaluateContactLeg(input, input.contactLegReference)
    : evaluateAiAgentLeg(input, input.contactLegReference);
}
