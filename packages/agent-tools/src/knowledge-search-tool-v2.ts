import {
  createZodToolValidator,
  evaluateKnowledgeProfileRuntime,
  KNOWLEDGE_SEARCH_DEFAULT_RESULTS,
  KNOWLEDGE_SEARCH_TOOL_NAME,
  knowledgeAgentProjectionSchema,
  knowledgeSearchToolInputSchema,
  type KnowledgeAgentProjectionPort,
  type KnowledgeProfilePolicy,
  type KnowledgeSearchToolInput,
  type KnowledgeSearchV2ToolOutput,
  type KnowledgeSearchV2UnavailableReason,
  type ToolDefinition,
  type ToolExecutionContext,
} from '@voice-agent/contracts';
import type { KnowledgeV2ConcurrencyLimiter } from './knowledge-v2-concurrency-limiter.js';
import { resolveVoiceKnowledgeScope } from './voice-knowledge-scope.js';

/** Identidade da versão PUBLICADA carregada pelo servidor (nunca do cliente). */
export interface KnowledgeV2ToolBinding {
  readonly organizationId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
}

export interface KnowledgeSearchV2ToolOptions {
  readonly projectionPort: KnowledgeAgentProjectionPort;
  readonly policy: KnowledgeProfilePolicy;
  readonly binding: KnowledgeV2ToolBinding;
  readonly limiter: KnowledgeV2ConcurrencyLimiter;
  readonly timeoutMs: number;
}

const UNAVAILABLE: KnowledgeSearchV2ToolOutput = Object.freeze({
  trust: 'UNTRUSTED_DATA',
  retrievalProfile: 'v2',
  status: 'KNOWLEDGE_PROFILE_UNAVAILABLE',
});

const sameBinding = (binding: KnowledgeV2ToolBinding, context: ToolExecutionContext) =>
  context.organizationId === binding.organizationId &&
  context.agentId === binding.agentId &&
  context.agentVersionId === binding.agentVersionId;

function unavailable(
  options: KnowledgeSearchV2ToolOptions,
  reason: KnowledgeSearchV2UnavailableReason,
): KnowledgeSearchV2ToolOutput {
  options.policy.report?.({
    event: 'knowledge.profile_unavailable',
    action: 'RUNTIME',
    organizationId: options.binding.organizationId,
    agentId: options.binding.agentId,
    agentVersionId: options.binding.agentVersionId,
    reason,
  });
  return UNAVAILABLE;
}

async function project(
  options: KnowledgeSearchV2ToolOptions,
  input: KnowledgeSearchToolInput,
): Promise<KnowledgeSearchV2ToolOutput> {
  const scope = resolveVoiceKnowledgeScope(options.binding);
  const topK = input.limit ?? KNOWLEDGE_SEARCH_DEFAULT_RESULTS;
  const outcome = await options.limiter.run(
    () => options.projectionPort.project({ scope, queryText: input.query, topK }),
    options.timeoutMs,
  );
  if (outcome.status !== 'OK') return unavailable(options, outcome.status);
  const parsed = knowledgeAgentProjectionSchema.safeParse(outcome.value);
  if (!parsed.success) return unavailable(options, 'INVALID_PROJECTION');
  return { trust: 'UNTRUSTED_DATA', retrievalProfile: 'v2', status: 'OK', projection: parsed.data };
}

/**
 * `knowledge.search` para versões com perfil `v2` (B2a, DEC-071). Usa SÓ a
 * projeção sanitizada da B2b; nunca chama a busca tradicional (`retrieve`), que
 * devolve trechos brutos. Travas, identidade, tempo limite, concorrência,
 * erro ou projeção inválida ⇒ falha controlada, sem conteúdo e sem v1.
 * NÃO registrada na voz nem em composição de telefonia.
 */
export function createKnowledgeSearchV2ToolDefinition(
  options: KnowledgeSearchV2ToolOptions,
): ToolDefinition<KnowledgeSearchToolInput, KnowledgeSearchV2ToolOutput> {
  return {
    name: KNOWLEDGE_SEARCH_TOOL_NAME,
    description: 'Busca fatos técnicos sanitizados nos documentos liberados para este agente.',
    validateInput: createZodToolValidator(knowledgeSearchToolInputSchema),
    execute: async (input, context) => {
      if (!sameBinding(options.binding, context)) return unavailable(options, 'BINDING_MISMATCH');
      const blocked = evaluateKnowledgeProfileRuntime(
        options.binding.organizationId,
        options.policy,
      );
      if (blocked)
        return unavailable(options, blocked === 'RUNTIME_OFF' ? 'RUNTIME_OFF' : 'ORG_NOT_ALLOWED');
      try {
        return await project(options, input);
      } catch {
        return unavailable(options, 'ERROR');
      }
    },
  };
}
