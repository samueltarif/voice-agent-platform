import type {
  CallSessionStorePort,
  ConversationHistoryPort,
  ConversationModelPort,
  VoiceTransportPort,
} from '@voice-agent/contracts';
import type { Logger } from '@voice-agent/logger';
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
  readonly options?: OrchestratorOptions;
}
