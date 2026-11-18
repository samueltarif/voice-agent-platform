import {
  createKnowledgeSearchV2ToolDefinition,
  InMemoryToolRegistry,
  runKnowledgeTurnV2,
  type KnowledgeV2ConcurrencyLimiter,
  type ToolAuthorizer,
} from '@voice-agent/agent-tools';
import type {
  KnowledgeAgentProjectionPort,
  KnowledgeProfilePolicy,
  SimulatedKnowledgeTurn,
  ToolExecutionContext,
} from '@voice-agent/contracts';
import type { PublishedAgentForSimulation } from '@voice-agent/database';

export interface KnowledgeSimulatedTurnV2Dependencies {
  readonly policy: KnowledgeProfilePolicy;
  readonly projectionPort: KnowledgeAgentProjectionPort;
  readonly limiter: KnowledgeV2ConcurrencyLimiter;
  readonly timeoutMs: number;
}

/**
 * B2a (DEC-071): turno simulado de versão PUBLICADA com perfil `v2`. A
 * identidade (organização da asserção, agente e versão publicada) vem do
 * carregador do servidor; a ferramenta confere esses ids, não a referência do
 * objeto. Só a projeção sanitizada da B2b; travas e falhas ⇒ falha controlada.
 */
export function runPublishedKnowledgeTurnV2(input: {
  readonly published: PublishedAgentForSimulation;
  readonly context: ToolExecutionContext;
  readonly isToolAllowed: ToolAuthorizer;
  readonly utterance: string;
  readonly deps: KnowledgeSimulatedTurnV2Dependencies;
}): Promise<SimulatedKnowledgeTurn> {
  const registry = new InMemoryToolRegistry();
  registry.registerTool(
    createKnowledgeSearchV2ToolDefinition({
      projectionPort: input.deps.projectionPort,
      policy: input.deps.policy,
      limiter: input.deps.limiter,
      timeoutMs: input.deps.timeoutMs,
      binding: {
        organizationId: input.context.organizationId,
        agentId: input.published.agentId,
        agentVersionId: input.published.agentVersionId,
      },
    }),
  );
  return runKnowledgeTurnV2({
    registry,
    isToolAllowed: input.isToolAllowed,
    context: input.context,
    utterance: input.utterance,
  });
}
