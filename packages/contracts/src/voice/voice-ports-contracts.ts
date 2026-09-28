import type { AgentConfigurationSnapshotV1 } from '../agents/agent-configuration-v1.js';
import type { CallSession } from './call-session-contracts.js';

export interface ConversationMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly turnId?: string;
}

export interface ConversationModelInput {
  readonly organizationId: string;
  readonly agentSnapshot: AgentConfigurationSnapshotV1;
  readonly messages: ReadonlyArray<ConversationMessage>;
  readonly turnId: string;
  readonly generationId: string;
}

export interface ConversationTextChunk {
  readonly textDelta: string;
  readonly turnId: string;
  readonly generationId: string;
  readonly isFinal: boolean;
}

export interface ConversationModelPort {
  readonly providerName: string;
  streamTurn(input: ConversationModelInput): Promise<AsyncIterable<ConversationTextChunk>>;
}

export interface VoiceTransportPort {
  readonly providerName: string;
  speak(
    callId: string,
    command: { text: string; generationId: string; isFinal: boolean },
  ): Promise<void>;
  interruptSpeech(callId: string, command?: { generationId?: string }): Promise<void>;
  endCall(callId: string, reason?: string): Promise<void>;
}

export interface CallSessionStorePort {
  getById(organizationId: string, callId: string): Promise<CallSession | null>;
  save(session: CallSession): Promise<void>;
}
