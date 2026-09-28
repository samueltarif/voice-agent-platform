import type { EndCallCommand, SpeakCommand, VoiceOutputCommand } from '@voice-agent/contracts';
import type {
  TwilioEndSessionMessage,
  TwilioOutboundMessage,
  TwilioTextTokenMessage,
} from './twilio-conversation-relay-types.js';

export function translateSpeakCommand(command: SpeakCommand): TwilioTextTokenMessage {
  return {
    type: 'text',
    token: command.text,
    last: command.isFinal,
  };
}

export function translateEndCallCommand(command: EndCallCommand): TwilioEndSessionMessage {
  if (command.reason !== undefined) {
    return {
      type: 'end',
      handoffData: JSON.stringify({ reason: command.reason }),
    };
  }
  return { type: 'end' };
}

export function translateVoiceOutputCommand(
  command: VoiceOutputCommand,
): TwilioOutboundMessage | null {
  switch (command.type) {
    case 'speak':
      return translateSpeakCommand(command);
    case 'end_call':
      return translateEndCallCommand(command);
    case 'interrupt_speech':
      return null;
  }
}
