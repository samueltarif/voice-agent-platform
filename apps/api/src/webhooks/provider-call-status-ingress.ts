import {
  attemptEventTypeForCallStatus,
  type NormalizedCallStatusEvent,
  type ProviderWebhookRequest,
} from '@voice-agent/contracts';
import type { ProviderResolvedAttempt } from '@voice-agent/database';
import {
  deriveProviderEventId,
  hashProviderPayload,
  redactProviderReference,
} from './provider-event-identity.js';
import type {
  ProviderWebhookDependencies,
  ProviderWebhookResponse,
} from './provider-webhook-ports.js';

/**
 * Resposta UNIFORME para toda entrega autenticada e bem-formada: chamada
 * desconhecida, de outro tenant, ambígua, duplicada, atrasada ou aplicada são
 * indistinguíveis para o remetente (sem oráculo de enumeração cross-tenant).
 */
const RECEIVED: ProviderWebhookResponse = { status: 202, body: { received: true } };

function buildDomainEvent(
  attempt: ProviderResolvedAttempt,
  event: NormalizedCallStatusEvent,
  eventId: string,
): Record<string, unknown> {
  const type = attemptEventTypeForCallStatus(event.status);
  const base = {
    eventId,
    organizationId: attempt.organizationId,
    attemptId: attempt.id,
    jobId: attempt.jobId,
    occurredAt: event.occurredAt,
    type,
  };
  if (type === 'ORIGINATION_ACCEPTED') {
    return { ...base, providerReference: event.providerCallReference };
  }
  if (type === 'ORIGINATION_REJECTED') {
    return { ...base, reasonCode: event.rejectionReason ?? 'PROVIDER_REFUSED' };
  }
  return base;
}

/**
 * Status de chamada → FSM durável (monotônica; eventos atrasados = STALE).
 * ZERO efeito financeiro: a semântica de custo de uma rejeição do provedor é
 * PROVIDER-UNVERIFIED (rejeição após SEND_STARTED/OUTCOME_UNKNOWN pode ainda
 * gerar cobrança). A reserva permanece encumberada até liquidação ou
 * reconciliação explícitas (008-OF5/008-MVP4), preservando a garantia da
 * 008-OF3 de que custo realizado é sempre registrável. Nunca rediscagem.
 */
export async function ingestCallStatus(
  deps: ProviderWebhookDependencies,
  request: ProviderWebhookRequest,
  event: NormalizedCallStatusEvent,
): Promise<ProviderWebhookResponse> {
  const ref = redactProviderReference(event.providerCallReference);
  const resolution = await deps.store.resolveByProviderReference(event.providerCallReference);
  if (resolution.kind !== 'RESOLVED') {
    deps.logger.warn('provider_webhook.quarantined', {
      provider: request.provider,
      reason: resolution.kind,
      ref,
    });
    return RECEIVED;
  }
  const { attempt } = resolution;
  const outcome = await deps.store.applyProviderEvent({
    attempt,
    event: buildDomainEvent(attempt, event, deriveProviderEventId(request.provider, event)),
    origin: {
      provider: request.provider,
      providerEventId: event.providerEventId,
      providerCallId: event.providerCallReference,
      payloadHash: hashProviderPayload(request.rawBody),
    },
    now: deps.now(),
  });
  const context = { provider: request.provider, organizationId: attempt.organizationId, ref };
  if (!('record' in outcome)) {
    deps.logger.warn('provider_webhook.quarantined', { ...context, reason: outcome.kind });
    return RECEIVED;
  }
  if (outcome.kind === 'REJECTED') {
    deps.logger.warn('provider_webhook.rejected_transition', {
      ...context,
      reason: outcome.reason,
    });
  }
  return RECEIVED;
}
