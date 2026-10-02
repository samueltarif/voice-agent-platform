import type {
  AuxiliaryTurnDecisionPort,
  CallSessionStorePort,
  ConversationHistoryPort,
  ConversationModelPort,
  VoiceTransportPort,
} from '@voice-agent/contracts';
import { createNullLogger, type Logger } from '@voice-agent/logger';
import { AssistantStreamCoordinator } from './assistant-stream-coordinator.js';
import type { AuxiliaryTurnShadowObserver } from './auxiliary-turn-shadow-observer.js';
import { CallSessionLifecycleCoordinator } from './call-session-lifecycle-coordinator.js';
import type { ConversationContextComposer } from './conversation-context-composer.js';
import { DeterministicResponseDeliveryCoordinator } from './deterministic-response-delivery-coordinator.js';
import { GuardedTurnRoutingCoordinator } from './guarded-turn-routing-coordinator.js';
import { InMemoryConversationHistoryStore } from './in-memory-conversation-history-store.js';

export interface OrchestratorOptions {
  readonly logger?: Logger;
  readonly enableTranscriptLogging?: boolean;
}

export interface SpeechFinalTurnOptions {
  readonly snapshot?: import('@voice-agent/contracts').AgentConfigurationSnapshotV1 | undefined;
  readonly configurationOrganizationId?: string | undefined;
}

export interface ConversationOrchestratorDependencies {
  readonly sessionStore: CallSessionStorePort;
  readonly transport: VoiceTransportPort;
  readonly model: ConversationModelPort;
  readonly historyStore?: ConversationHistoryPort | undefined;
  readonly contextComposer?: ConversationContextComposer | undefined;
  readonly shadowObserver?: AuxiliaryTurnShadowObserver | undefined;
  readonly guardedRoutingCoordinator?: GuardedTurnRoutingCoordinator | undefined;
  readonly guardedRoutingPort?: AuxiliaryTurnDecisionPort | undefined;
  readonly options?: OrchestratorOptions;
}

export interface OrchestratorCoordinatorsOptions {
  readonly isGenerationActive: (callId: string, generationId: string) => boolean;
  readonly onCallTerminated: (organizationId: string, callId: string) => void;
}

export interface ResolveOrchestratorContextParams {
  readonly deps: CallSessionStorePort | ConversationOrchestratorDependencies;
  readonly transport?: VoiceTransportPort | undefined;
  readonly model?: ConversationModelPort | undefined;
  readonly options?: OrchestratorCoordinatorsOptions | undefined;
}

export interface ResolvedOrchestratorContext {
  readonly sessionStore: CallSessionStorePort;
  readonly transport: VoiceTransportPort;
  readonly historyStore: ConversationHistoryPort;
  readonly logger: Logger;
  readonly shadowObserver?: AuxiliaryTurnShadowObserver | undefined;
  readonly streamCoordinator: AssistantStreamCoordinator;
  readonly deterministicDeliveryCoordinator?: DeterministicResponseDeliveryCoordinator | undefined;
  readonly lifecycleCoordinator?: CallSessionLifecycleCoordinator | undefined;
  readonly guardedRoutingCoordinator?: GuardedTurnRoutingCoordinator | undefined;
  readonly guardedRoutingPort?: AuxiliaryTurnDecisionPort | undefined;
}

export function resolveOrchestratorDeps(
  deps: CallSessionStorePort | ConversationOrchestratorDependencies,
  transport?: VoiceTransportPort,
  model?: ConversationModelPort,
): ConversationOrchestratorDependencies {
  if ('sessionStore' in deps) return deps;
  return { sessionStore: deps, transport: transport!, model: model! };
}

interface CoordinatorResolutionContext {
  readonly historyStore: ConversationHistoryPort;
  readonly logger: Logger;
  readonly options?: OrchestratorCoordinatorsOptions | undefined;
}

function resolveGuardedCoordinator(
  resolved: ConversationOrchestratorDependencies,
  delivery: DeterministicResponseDeliveryCoordinator | undefined,
  ctx: CoordinatorResolutionContext,
): GuardedTurnRoutingCoordinator | undefined {
  if (resolved.guardedRoutingCoordinator) return resolved.guardedRoutingCoordinator;
  if (!resolved.guardedRoutingPort || !ctx.options || !delivery) return undefined;
  return new GuardedTurnRoutingCoordinator({
    port: resolved.guardedRoutingPort,
    deliveryCoordinator: delivery,
    logger: ctx.logger,
    isGenerationActive: ctx.options.isGenerationActive,
  });
}

function resolveCoordinators(
  resolved: ConversationOrchestratorDependencies,
  ctx: CoordinatorResolutionContext,
) {
  if (!ctx.options) {
    return {
      deterministicDeliveryCoordinator: undefined,
      lifecycleCoordinator: undefined,
      guardedRoutingCoordinator: resolved.guardedRoutingCoordinator,
    };
  }
  const delivery = new DeterministicResponseDeliveryCoordinator({
    transport: resolved.transport,
    historyStore: ctx.historyStore,
    logger: ctx.logger,
    isGenerationActive: ctx.options.isGenerationActive,
  });
  const lifecycle = new CallSessionLifecycleCoordinator({
    sessionStore: resolved.sessionStore,
    transport: resolved.transport,
    onCallTerminated: ctx.options.onCallTerminated,
  });
  const guarded = resolveGuardedCoordinator(resolved, delivery, ctx);
  return {
    deterministicDeliveryCoordinator: delivery,
    lifecycleCoordinator: lifecycle,
    guardedRoutingCoordinator: guarded,
  };
}

export function resolveOrchestratorContext(
  params: ResolveOrchestratorContextParams,
): ResolvedOrchestratorContext {
  const resolved = resolveOrchestratorDeps(params.deps, params.transport, params.model);
  const historyStore = resolved.historyStore ?? new InMemoryConversationHistoryStore();
  const logger = resolved.options?.logger ?? createNullLogger();
  const streamCoordinator = new AssistantStreamCoordinator({
    transport: resolved.transport,
    model: resolved.model,
    logger,
    historyStore,
    contextComposer: resolved.contextComposer,
  });
  const coordinators = resolveCoordinators(resolved, {
    historyStore,
    logger,
    options: params.options,
  });

  return {
    sessionStore: resolved.sessionStore,
    transport: resolved.transport,
    historyStore,
    logger,
    shadowObserver: resolved.shadowObserver,
    streamCoordinator,
    ...coordinators,
    guardedRoutingPort: resolved.guardedRoutingPort,
  };
}
