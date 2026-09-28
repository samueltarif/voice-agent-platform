import type { VoiceTransportPort } from '@voice-agent/contracts';
import { VoiceTransportError } from '@voice-agent/errors';
import { translateEndCallCommand, translateSpeakCommand } from './twilio-command-translator.js';
import type { TwilioOutboundMessage } from './twilio-conversation-relay-types.js';

export interface TwilioSocketSender {
  sendMessage(message: TwilioOutboundMessage): Promise<void>;
  close(reason?: string): Promise<void>;
}

export class TwilioVoiceTransportAdapter implements VoiceTransportPort {
  readonly providerName = 'twilio-conversation-relay';
  private readonly senders = new Map<string, TwilioSocketSender>();
  private readonly activeGenerations = new Map<string, string>();
  private readonly cancelledGenerations = new Set<string>();

  bindSender(callId: string, sender: TwilioSocketSender): void {
    this.senders.set(callId, sender);
  }

  unbindSender(callId: string): void {
    this.senders.delete(callId);
    this.activeGenerations.delete(callId);
  }

  async speak(
    callId: string,
    command: { text: string; generationId: string; isFinal: boolean },
  ): Promise<void> {
    const sender = this.senders.get(callId);
    if (!sender) {
      throw new VoiceTransportError(`No active transport connection for callId: ${callId}`);
    }

    if (this.cancelledGenerations.has(command.generationId)) {
      return;
    }

    const currentGeneration = this.activeGenerations.get(callId);
    if (currentGeneration && currentGeneration !== command.generationId) {
      return;
    }

    this.activeGenerations.set(callId, command.generationId);
    const twilioMessage = translateSpeakCommand({
      type: 'speak',
      callId,
      text: command.text,
      generationId: command.generationId,
      isFinal: command.isFinal,
    });

    await sender.sendMessage(twilioMessage);

    if (command.isFinal) {
      this.activeGenerations.delete(callId);
    }
  }

  async interruptSpeech(callId: string, command?: { generationId?: string }): Promise<void> {
    if (command?.generationId) {
      this.cancelledGenerations.add(command.generationId);
    }
    const currentGeneration = this.activeGenerations.get(callId);
    if (currentGeneration) {
      this.cancelledGenerations.add(currentGeneration);
      this.activeGenerations.delete(callId);
    }
  }

  async endCall(callId: string, reason?: string): Promise<void> {
    const sender = this.senders.get(callId);
    if (!sender) {
      return;
    }

    try {
      const endMessage = translateEndCallCommand({
        type: 'end_call',
        callId,
        ...(reason !== undefined ? { reason } : {}),
      });
      await sender.sendMessage(endMessage);
    } finally {
      await sender.close(reason);
      this.unbindSender(callId);
    }
  }
}
