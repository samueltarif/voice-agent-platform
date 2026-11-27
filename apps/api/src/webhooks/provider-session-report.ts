import type { NormalizedSessionReportEvent, ProviderWebhookRequest } from '@voice-agent/contracts';
import { redactProviderReference } from './provider-event-identity.js';
import type {
  ProviderWebhookDependencies,
  ProviderWebhookResponse,
} from './provider-webhook-ports.js';

/**
 * DEC-077 — relatório PÓS-CHAMADA já autenticado e normalizado. A tentativa
 * (e com ela tenant, sessão, agente e telefone) é resolvida SÓ pela
 * referência opaca no banco; desconhecida ou ambígua não tem efeito e recebe
 * a mesma resposta (o remetente não distingue os casos). A reconciliação é
 * idempotente: entregas repetidas não duplicam efeitos.
 */
const IGNORED: ProviderWebhookResponse = { status: 202, body: { status: 'IGNORED' } };

export async function ingestSessionReport(
  deps: ProviderWebhookDependencies,
  request: ProviderWebhookRequest,
  event: NormalizedSessionReportEvent,
): Promise<ProviderWebhookResponse> {
  const ref = redactProviderReference(event.providerCallReference);
  if (!deps.reports) {
    deps.logger.warn('provider_webhook.session_report_disabled', {
      provider: request.provider,
      ref,
    });
    return IGNORED;
  }
  const resolution = await deps.store.resolveByProviderReference(event.providerCallReference);
  if (resolution.kind !== 'RESOLVED') {
    deps.logger.warn('provider_webhook.session_report_unresolved', {
      provider: request.provider,
      reason: resolution.kind,
      ref,
    });
    return IGNORED;
  }
  const { attempt } = resolution;
  const result = await deps.reports.ingest(
    {
      organizationId: attempt.organizationId,
      attemptId: attempt.id,
      jobId: attempt.jobId,
      callSessionId: attempt.callSessionId,
      agentId: attempt.agentId,
      agentVersionId: attempt.agentVersionId,
    },
    event.report,
  );
  deps.logger.info('provider_webhook.session_report', {
    provider: request.provider,
    organizationId: attempt.organizationId,
    status: result.status,
  });
  return { status: 200, body: { status: 'RECEIVED' } };
}
