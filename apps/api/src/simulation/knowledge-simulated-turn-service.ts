import {
  createKnowledgeSearchToolDefinition,
  InMemoryToolRegistry,
  runKnowledgeTurn,
  type ToolAuthorizer,
} from '@voice-agent/agent-tools';
import {
  isToolConfiguredInSnapshot,
  knowledgeSimulatedTurnResponseSchema,
  type KnowledgeSimulatedTurnResponse,
  type ToolExecutionContext,
} from '@voice-agent/contracts';
import {
  DrizzleKnowledgeRetrievalService,
  loadPublishedAgentForSimulation,
  type DatabaseInstance,
  type PublishedAgentForSimulation,
} from '@voice-agent/database';

export interface KnowledgeSimulatedTurnRequest {
  /** Sempre a organização da asserção autenticada, nunca do corpo. */
  readonly organizationId: string;
  readonly agentId: string;
  readonly utterance: string;
}

export interface KnowledgeSimulatedTurnPort {
  run(request: KnowledgeSimulatedTurnRequest): Promise<KnowledgeSimulatedTurnResponse>;
}

/**
 * Autorizador ligado à versão publicada lida no servidor: só aceita o MESMO
 * contexto (organização, agente, versão e objeto de snapshot) e só ferramentas
 * da lista da versão publicada (regra única de `packages/contracts`).
 */
function authorizerFor(
  published: PublishedAgentForSimulation,
  context: ToolExecutionContext,
): ToolAuthorizer {
  return (toolName, ctx) =>
    ctx.organizationId === context.organizationId &&
    ctx.agentId === published.agentId &&
    ctx.agentVersionId === published.agentVersionId &&
    ctx.snapshot === published.snapshot &&
    isToolConfiguredInSnapshot(toolName, published.snapshot);
}

/**
 * Simulador do Agent Studio (DEC-061): turno determinístico com
 * `knowledge.search` da versão publicada. Sem IA, chamada, campanha, worker ou
 * provedor; só leitura do banco.
 */
export function createKnowledgeSimulatedTurnService(
  db: DatabaseInstance,
): KnowledgeSimulatedTurnPort {
  return {
    async run(request) {
      const published = await loadPublishedAgentForSimulation(db, request);
      const context: ToolExecutionContext = {
        organizationId: request.organizationId,
        agentId: published.agentId,
        agentVersionId: published.agentVersionId,
        snapshot: published.snapshot,
      };
      const registry = new InMemoryToolRegistry();
      registry.registerTool(
        createKnowledgeSearchToolDefinition({
          retrievalPort: new DrizzleKnowledgeRetrievalService(db),
        }),
      );
      const turn = await runKnowledgeTurn({
        registry,
        isToolAllowed: authorizerFor(published, context),
        context,
        utterance: request.utterance,
      });
      return knowledgeSimulatedTurnResponseSchema.parse({
        agent: {
          agentId: published.agentId,
          name: published.agentName.slice(0, 200),
          agentVersionId: published.agentVersionId,
          versionNumber: published.versionNumber,
        },
        turn,
      });
    },
  };
}
