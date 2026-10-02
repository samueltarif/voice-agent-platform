import type { DispatchDeterministicResponseInput } from './deterministic-response-delivery.js';
import {
  type SecurityBlockedResult,
  createSecurityBlockedResult,
} from './security-blocked-action.js';

/**
 * Canonical static safe response text for SECURITY_BLOCKED turns.
 * Neutral, polite, non-accusatory, non-revealing.
 * Does not disclose scores, thresholds, policies, or provider details.
 */
export const CANONICAL_SECURITY_BLOCKED_RESPONSE =
  'Não consigo ajudar com esse tipo de solicitação. Posso continuar ajudando com informações autorizadas sobre nosso atendimento e serviços.';

export interface DeliverSecurityBlockedResponseInput {
  readonly organizationId: string;
  readonly callId: string;
  readonly assistantTurnId: string;
  readonly generationId: string;
  readonly securityResult?: SecurityBlockedResult | undefined;
}

/**
 * Adapts an offline security-blocked delivery request into a deterministic response input.
 * Reuses the existing response delivery lifecycle without creating a second playback engine.
 */
export function resolveSecurityBlockedDeliveryInput(
  input: DeliverSecurityBlockedResponseInput,
): DispatchDeterministicResponseInput {
  // Validate or instantiate the minimal SecurityBlockedResult
  const result = input.securityResult ?? createSecurityBlockedResult();
  if (result.outcome !== 'SECURITY_BLOCKED') {
    throw new Error(`Invalid security outcome for security response delivery: ${result.outcome}`);
  }

  return {
    organizationId: input.organizationId,
    callId: input.callId,
    assistantTurnId: input.assistantTurnId,
    generationId: input.generationId,
    responseText: CANONICAL_SECURITY_BLOCKED_RESPONSE,
  };
}
