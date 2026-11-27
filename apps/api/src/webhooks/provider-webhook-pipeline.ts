import { normalizedProviderEventSchema, type ProviderWebhookRequest } from '@voice-agent/contracts';
import { ingestCallStatus } from './provider-call-status-ingress.js';
import { ingestSessionReport } from './provider-session-report.js';
import { dispatchToolInvocation } from './provider-tool-invocation.js';
import type {
  ProviderWebhookDependencies,
  ProviderWebhookResponse,
} from './provider-webhook-ports.js';

const UNAUTHENTICATED: ProviderWebhookResponse = {
  status: 401,
  body: { error: 'UNAUTHENTICATED' },
};
const INVALID_PAYLOAD: ProviderWebhookResponse = {
  status: 400,
  body: { error: 'INVALID_PAYLOAD' },
};

export type ProviderWebhookChannel = 'CALL_STATUS' | 'TOOL_INVOCATION' | 'SESSION_REPORT';

/**
 * Ordem fail-closed: provedor habilitado → autenticação da entrega →
 * normalização + validação estrita → canal coerente com a rota → despacho.
 * Provedor desconhecido e credencial inválida são indistinguíveis (401).
 * Nenhum campo de tenant do payload é aceito: a resolução é server-side.
 */
export async function handleProviderWebhook(
  deps: ProviderWebhookDependencies,
  request: ProviderWebhookRequest,
  channel: ProviderWebhookChannel,
): Promise<ProviderWebhookResponse> {
  const adapter = deps.providers.get(request.provider);
  if (!adapter) return UNAUTHENTICATED;
  const auth = await adapter.authenticator.authenticate(request);
  if (auth.kind !== 'AUTHENTICATED') {
    deps.logger.warn('provider_webhook.unauthenticated', {
      provider: request.provider,
      reason: auth.reason,
    });
    return UNAUTHENTICATED;
  }
  const parsed = normalizedProviderEventSchema.safeParse(adapter.normalizer.normalize(request));
  if (!parsed.success || parsed.data.kind !== channel) {
    deps.logger.warn('provider_webhook.invalid_payload', { provider: request.provider, channel });
    return INVALID_PAYLOAD;
  }
  const event = parsed.data;
  if (event.kind === 'CALL_STATUS') return ingestCallStatus(deps, request, event);
  if (event.kind === 'TOOL_INVOCATION') return dispatchToolInvocation(deps, request, event);
  return ingestSessionReport(deps, request, event);
}
