import type { DomainEvent, TelephonyPort } from '@voice-agent/contracts';
import { createNullLogger, type Logger } from '@voice-agent/logger';

export interface VoiceEngineContext {
  readonly logger: Logger;
  readonly telephony?: TelephonyPort;
}

export function createVoiceContext(): VoiceEngineContext {
  return {
    logger: createNullLogger(),
  };
}

export const VOICE_APP = 'voice' as const;
export type { DomainEvent };

export * from './call-session-state-machine.js';
export * from './create-call-session.js';
export * from './in-memory-call-session-store.js';
export * from './assistant-stream-coordinator.js';
export * from './conversation-orchestrator.js';
export * from './fake-voice-transport.js';
export * from './fake-conversation-model.js';
