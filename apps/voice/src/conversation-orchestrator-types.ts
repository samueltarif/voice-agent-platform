import type {
  CallSessionStorePort,
  ConversationHistoryPort,
  ConversationModelPort,
  VoiceTransportPort,
} from '@voice-agent/contracts';
import { createNullLogger, type Logger } from '@voice-agent/logger';
import { AssistantStreamCoordinator } from './assistant-stream-coordinator.js';
import type { AuxiliaryTurnShadowObserver } from './auxiliary-turn-shadow-observer.js';
import type { ConversationContextComposer } from './conversation-context-composer.js';
import { InMemoryConversationHistoryStore } from './in-memory-conversation-history-store.js';

export interface OrchestratorOptions {
  readonly logger?: Logger;
  readonly enableTranscriptLogging?: boolean;
}

export interface ConversationOrchestratorDependencies {
  readonly sessionStore: CallSessionStorePort;
  readonly transport: VoiceTransportPort;
  readonly model: ConversationModelPort;
  readonly historyStore?: ConversationHistoryPort | undefined;
  readonly contextComposer?: ConversationContextComposer | undefined;
  readonly shadowObserver?: AuxiliaryTurnShadowObserver | undefined;
  readonly options?: OrchestratorOptions;
}

export interface ResolvedOrchestratorContext {
  readonly sessionStore: CallSessionStorePort;
  readonly transport: VoiceTransportPort;
  readonly historyStore: ConversationHistoryPort;
  readonly logger: Logger;
  readonly shadowObserver?: AuxiliaryTurnShadowObserver | undefined;
  readonly streamCoordinator: AssistantStreamCoordinator;
}

export function resolveOrchestratorDeps(
  deps: CallSessionStorePort | ConversationOrchestratorDependencies,
  transport?: VoiceTransportPort,
  model?: ConversationModelPort,
): ConversationOrchestratorDependencies {
  if ('sessionStore' in deps) return deps;
  return { sessionStore: deps, transport: transport!, model: model! };
}

export function resolveOrchestratorContext(
  deps: CallSessionStorePort | ConversationOrchestratorDependencies,
  transport?: VoiceTransportPort,
  model?: ConversationModelPort,
): ResolvedOrchestratorContext {
  const resolved = resolveOrchestratorDeps(deps, transport, model);
  const historyStore = resolved.historyStore ?? new InMemoryConversationHistoryStore();
  const logger = resolved.options?.logger ?? createNullLogger();
  const streamCoordinator = new AssistantStreamCoordinator({
    transport: resolved.transport,
    model: resolved.model,
    logger,
    historyStore,
    contextComposer: resolved.contextComposer,
  });
  return {
    sessionStore: resolved.sessionStore,
    transport: resolved.transport,
    historyStore,
    logger,
    shadowObserver: resolved.shadowObserver,
    streamCoordinator,
  };
}
