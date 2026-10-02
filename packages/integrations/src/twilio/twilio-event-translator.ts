import type {
  ProviderFailureEvent,
  TransportConnectedEvent,
  TransportDisconnectedEvent,
  UserInterruptionEvent,
  UserSpeechFinalEvent,
  VoiceInputEvent,
} from '@voice-agent/contracts';
import type {
  TwilioErrorMessage,
  TwilioInboundMessage,
  TwilioInterruptMessage,
  TwilioPromptMessage,
} from './twilio-conversation-relay-types.js';

export interface TwilioEventTranslationContext {
  readonly organizationId: string;
  readonly callId: string;
  readonly now?: () => Date;
  readonly turnIdGenerator?: () => string;
}

interface EventMeta {
  readonly timestamp: Date;
  readonly turnId: string;
}

function resolveEventMeta(context: TwilioEventTranslationContext): EventMeta {
  const timestamp = context.now ? context.now() : new Date();
  const turnId = context.turnIdGenerator ? context.turnIdGenerator() : `turn_${Date.now()}`;
  return { timestamp, turnId };
}

function translatePromptEvent(
  message: TwilioPromptMessage,
  context: TwilioEventTranslationContext,
  meta: EventMeta,
): UserSpeechFinalEvent {
  return {
    type: 'user.speech.final',
    callId: context.callId,
    organizationId: context.organizationId,
    turnId: meta.turnId,
    transcript: message.voicePrompt,
    timestamp: meta.timestamp,
  };
}

function translateErrorEvent(
  message: TwilioErrorMessage,
  context: TwilioEventTranslationContext,
  timestamp: Date,
): ProviderFailureEvent {
  const defaultDesc = `Twilio error code ${message.code !== undefined ? message.code : 'unknown'}`;
  return {
    type: 'provider.failure',
    callId: context.callId,
    organizationId: context.organizationId,
    error: message.description ? message.description : defaultDesc,
    timestamp,
  };
}

function translateInterruptEvent(
  message: TwilioInterruptMessage,
  context: TwilioEventTranslationContext,
  meta: EventMeta,
): UserInterruptionEvent {
  return {
    type: 'user.interruption',
    callId: context.callId,
    organizationId: context.organizationId,
    turnId: meta.turnId,
    timestamp: meta.timestamp,
    ...(message.utteranceUntilInterrupt !== undefined
      ? { interruptedUtterance: message.utteranceUntilInterrupt }
      : {}),
    ...(message.durationUntilInterruptMs !== undefined
      ? { interruptedDurationMs: message.durationUntilInterruptMs }
      : {}),
  };
}

export function translateTwilioInboundEvent(
  message: TwilioInboundMessage,
  context: TwilioEventTranslationContext,
): VoiceInputEvent | null {
  const meta = resolveEventMeta(context);

  switch (message.type) {
    case 'setup':
      return {
        type: 'transport.connected',
        callId: context.callId,
        organizationId: context.organizationId,
        timestamp: meta.timestamp,
      } as TransportConnectedEvent;
    case 'prompt':
      return translatePromptEvent(message, context, meta);
    case 'interrupt':
      return translateInterruptEvent(message, context, meta);
    case 'disconnect':
      return {
        type: 'transport.disconnected',
        callId: context.callId,
        organizationId: context.organizationId,
        reason: message.reason,
        timestamp: meta.timestamp,
      } as TransportDisconnectedEvent;
    case 'error':
      return translateErrorEvent(message, context, meta.timestamp);
    default:
      return null;
  }
}
