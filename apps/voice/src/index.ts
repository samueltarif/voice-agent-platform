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
