import type {
  NormalizedToolInvocationEvent,
  ProviderWebhookRequest,
  ToolExecutionResult,
} from '@voice-agent/contracts';
import type { ProviderResolvedAttempt } from '@voice-agent/database';
import { redactProviderReference } from './provider-event-identity.js';
import type {
  ProviderWebhookDependencies,
  ProviderWebhookResponse,
} from './provider-webhook-ports.js';

/**
 * Mesma resposta para chamada desconhecida, de outro tenant, ambígua ou fora
 * de uma chamada ativa: o remetente não distingue os casos.
 */
const UNAVAILABLE: ProviderWebhookResponse = {
  status: 200,
  body: { status: 'REJECTED', reason: 'TOOL_UNAVAILABLE' },
};

/** Ferramentas só durante chamada aceita pela autoridade de originação. */
const LIVE_STATES: ReadonlySet<ProviderResolvedAttempt['state']> = new Set([
  'ORIGINATION_ACCEPTED',
]);

function failedResult(
  deps: ProviderWebhookDependencies,
  event: NormalizedToolInvocationEvent,
  error: unknown,
): ToolExecutionResult {
  // Falha registrada (nunca silenciosa); detalhes internos não vão ao provedor.
  deps.logger.error('provider_webhook.tool_execution_failed', {
    toolName: event.toolName,
    errorName: error instanceof Error ? error.name : typeof error,
  });
  return {
    status: 'FAILED',
    toolName: event.toolName,
    invocationId: event.invocationId,
    reason: 'EXECUTION_FAILED',
    message: 'Tool execution failed.',
  };
}

function timeoutResult(event: NormalizedToolInvocationEvent): ToolExecutionResult {
  return {
    status: 'FAILED',
    toolName: event.toolName,
    invocationId: event.invocationId,
    reason: 'TIMEOUT',
    message: 'Tool execution exceeded the internal time limit.',
  };
}

async function executeWithTimeout(
  deps: ProviderWebhookDependencies,
  attempt: ProviderResolvedAttempt,
  event: NormalizedToolInvocationEvent,
): Promise<ToolExecutionResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<ToolExecutionResult>((resolve) => {
    timer = setTimeout(() => resolve(timeoutResult(event)), deps.toolTimeoutMs);
  });
  // Contexto 100% server-side: tenant, agente e versão vêm da tentativa durável.
  // Nunca rejeita: falhas (inclusive tardias, após o timeout) viram FAILED registrado.
  const execution = Promise.resolve()
    .then(() =>
      deps.tools.executeTool(
        {
          toolName: event.toolName,
          invocationId: event.invocationId,
          rawArguments: event.arguments,
        },
        {
          organizationId: attempt.organizationId,
          agentId: attempt.agentId,
          agentVersionId: attempt.agentVersionId,
          callId: attempt.id,
        },
      ),
    )
    .catch((error: unknown) => failedResult(deps, event, error));
  try {
    return await Promise.race([execution, expired]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Despacho determinístico para a `ToolPort` (o `ToolExecutionEngine` de
 * `apps/voice` aplica registro e autorização da versão publicada). Timeout
 * interno fail-closed; falha da ferramenta vira FAILED, nunca erro 5xx.
 */
export async function dispatchToolInvocation(
  deps: ProviderWebhookDependencies,
  request: ProviderWebhookRequest,
  event: NormalizedToolInvocationEvent,
): Promise<ProviderWebhookResponse> {
  const ref = redactProviderReference(event.providerCallReference);
  const resolution = await deps.store.resolveByProviderReference(event.providerCallReference);
  if (resolution.kind !== 'RESOLVED' || !LIVE_STATES.has(resolution.attempt.state)) {
    const reason = resolution.kind === 'RESOLVED' ? 'CALL_NOT_LIVE' : resolution.kind;
    deps.logger.warn('provider_webhook.tool_unavailable', {
      provider: request.provider,
      reason,
      ref,
    });
    return UNAVAILABLE;
  }
  const { attempt } = resolution;
  const result = await executeWithTimeout(deps, attempt, event);
  deps.logger.info('provider_webhook.tool_dispatched', {
    provider: request.provider,
    organizationId: attempt.organizationId,
    toolName: event.toolName,
    status: result.status,
  });
  return { status: 200, body: { ...result } };
}
