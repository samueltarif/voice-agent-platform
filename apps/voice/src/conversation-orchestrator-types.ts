import type {
  CallSessionStorePort,
  ConversationHistoryPort,
  ConversationModelPort,
  VoiceTransportPort,
} from '@voice-agent/contracts';
import type { Logger } from '@voice-agent/logger';
import type { AuxiliaryTurnShadowObserver } from './auxiliary-turn-shadow-observer.js';
import type { ConversationContextComposer } from './conversation-context-composer.js';

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

export function resolveOrchestratorDeps(
  deps: CallSessionStorePort | ConversationOrchestratorDependencies,
  transport?: VoiceTransportPort,
  model?: ConversationModelPort,
): ConversationOrchestratorDependencies {
  if ('sessionStore' in deps) return deps;
  return { sessionStore: deps, transport: transport!, model: model! };
}
