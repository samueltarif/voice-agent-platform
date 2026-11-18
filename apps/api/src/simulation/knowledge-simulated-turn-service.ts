import {
  createKnowledgeSearchToolDefinition,
  InMemoryToolRegistry,
  KnowledgeV2ConcurrencyLimiter,
  runKnowledgeTurn,
  type ToolAuthorizer,
} from '@voice-agent/agent-tools';
import {
  CLOSED_KNOWLEDGE_PROFILE_POLICY,
  isToolConfiguredInSnapshot,
  KNOWLEDGE_SEARCH_V2_MAX_CONCURRENCY,
  KNOWLEDGE_SEARCH_V2_SIMULATION_TIMEOUT_MS,
  knowledgeSimulatedTurnResponseSchema,
  resolveKnowledgeRetrievalProfile,
  type KnowledgeSimulatedTurnResponse,
  type SimulatedKnowledgeTurn,
  type ToolExecutionContext,
} from '@voice-agent/contracts';
import {
  DrizzleKnowledgeAgentProjectionService,
  DrizzleKnowledgeRetrievalService,
  loadPublishedAgentForSimulation,
  type DatabaseInstance,
  type PublishedAgentForSimulation,
} from '@voice-agent/database';
import {
  runPublishedKnowledgeTurnV2,
  type KnowledgeSimulatedTurnV2Dependencies,
} from './knowledge-simulated-turn-v2.js';

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
/** Turno v1 (caminho existente, inalterado): nunca consulta as travas da v2. */
function runV1Turn(
  db: DatabaseInstance,
  turn: {
    published: PublishedAgentForSimulation;
    context: ToolExecutionContext;
    utterance: string;
  },
): Promise<SimulatedKnowledgeTurn> {
  const registry = new InMemoryToolRegistry();
  registry.registerTool(
    createKnowledgeSearchToolDefinition({
      retrievalPort: new DrizzleKnowledgeRetrievalService(db),
    }),
  );
  return runKnowledgeTurn({
    registry,
    isToolAllowed: authorizerFor(turn.published, turn.context),
    context: turn.context,
    utterance: turn.utterance,
  });
}

export interface KnowledgeSimulatedTurnServiceOptions {
  /** B2a: travas da plataforma; padrão FECHADO (v2 sempre indisponível). */
  readonly policy?: KnowledgeSimulatedTurnV2Dependencies['policy'] | undefined;
  readonly limiter?: KnowledgeV2ConcurrencyLimiter | undefined;
  readonly projectionPort?: KnowledgeSimulatedTurnV2Dependencies['projectionPort'] | undefined;
  readonly timeoutMs?: number | undefined;
}

function v2Dependencies(
  db: DatabaseInstance,
  options: KnowledgeSimulatedTurnServiceOptions,
): KnowledgeSimulatedTurnV2Dependencies {
  return {
    policy: options.policy ?? CLOSED_KNOWLEDGE_PROFILE_POLICY,
    projectionPort: options.projectionPort ?? new DrizzleKnowledgeAgentProjectionService(db),
    limiter:
      options.limiter ?? new KnowledgeV2ConcurrencyLimiter(KNOWLEDGE_SEARCH_V2_MAX_CONCURRENCY),
    timeoutMs: options.timeoutMs ?? KNOWLEDGE_SEARCH_V2_SIMULATION_TIMEOUT_MS,
  };
}

export function createKnowledgeSimulatedTurnService(
  db: DatabaseInstance,
  options: KnowledgeSimulatedTurnServiceOptions = {},
): KnowledgeSimulatedTurnPort {
  const v2 = v2Dependencies(db, options);
  return {
    async run(request) {
      const published = await loadPublishedAgentForSimulation(db, request);
      const context: ToolExecutionContext = {
        organizationId: request.organizationId,
        agentId: published.agentId,
        agentVersionId: published.agentVersionId,
        snapshot: published.snapshot,
      };
      const isV2 = resolveKnowledgeRetrievalProfile(published.snapshot) === 'v2';
      const turn = isV2
        ? await runPublishedKnowledgeTurnV2({
            published,
            context,
            isToolAllowed: authorizerFor(published, context),
            utterance: request.utterance,
            deps: v2,
          })
        : await runV1Turn(db, { published, context, utterance: request.utterance });
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
