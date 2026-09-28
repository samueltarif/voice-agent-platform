import type {
  TwilioEndSessionMessage,
  TwilioOutboundMessage,
  TwilioTextTokenMessage,
} from './twilio-conversation-relay-types.js';
import type { TwilioSocketSender } from './twilio-voice-transport-adapter.js';
import type { TwilioWebSocketBoundary } from './twilio-websocket-boundary.js';

export class FakeTwilioConversationRelaySimulator implements TwilioSocketSender {
  readonly sentMessages: TwilioOutboundMessage[] = [];
  readonly sentTextTokens: TwilioTextTokenMessage[] = [];
  readonly sentEndSessions: TwilioEndSessionMessage[] = [];
  isClosed = false;
  closeReason?: string | undefined;
  private boundary?: TwilioWebSocketBoundary | undefined;

  attachBoundary(boundary: TwilioWebSocketBoundary): void {
    this.boundary = boundary;
  }

  async sendMessage(message: TwilioOutboundMessage): Promise<void> {
    this.sentMessages.push(message);
    if (message.type === 'text') {
      this.sentTextTokens.push(message);
    } else if (message.type === 'end') {
      this.sentEndSessions.push(message);
    }
  }

  async close(reason?: string): Promise<void> {
    this.isClosed = true;
    this.closeReason = reason;
  }

  async simulateSetup(
    callSid = 'CA_simulated_call_sid',
    sessionId = 'CR_simulated_session_id',
    customParameters?: Record<string, string>,
  ): Promise<void> {
    this.assertBoundaryAttached();
    const payload = JSON.stringify({
      type: 'setup',
      sessionId,
      callSid,
      customParameters,
    });
    await this.boundary?.handleIncomingRaw(payload);
  }

  async simulatePrompt(voicePrompt: string, lang = 'pt-BR'): Promise<void> {
    this.assertBoundaryAttached();
    const payload = JSON.stringify({
      type: 'prompt',
      voicePrompt,
      lang,
      last: true,
    });
    await this.boundary?.handleIncomingRaw(payload);
  }

  async simulateInterrupt(utteranceUntilInterrupt?: string): Promise<void> {
    this.assertBoundaryAttached();
    const payload = JSON.stringify({
      type: 'interrupt',
      utteranceUntilInterrupt,
      durationUntilInterruptMs: 1200,
    });
    await this.boundary?.handleIncomingRaw(payload);
  }

  async simulateError(code = 64107, description = 'Schema validation error'): Promise<void> {
    this.assertBoundaryAttached();
    const payload = JSON.stringify({
      type: 'error',
      code,
      description,
    });
    await this.boundary?.handleIncomingRaw(payload);
  }

  async simulateDisconnect(reason = 'caller_hangup'): Promise<void> {
    this.assertBoundaryAttached();
    await this.boundary?.handleClose(reason);
  }

  async simulateMalformedPayload(corruptedString = 'INVALID_NOT_JSON{['): Promise<void> {
    this.assertBoundaryAttached();
    await this.boundary?.handleIncomingRaw(corruptedString);
  }

  async simulateUnknownEvent(rawType = 'custom_telephony_event'): Promise<void> {
    this.assertBoundaryAttached();
    const payload = JSON.stringify({
      type: rawType,
      foo: 'bar',
    });
    await this.boundary?.handleIncomingRaw(payload);
  }

  reset(): void {
    this.sentMessages.length = 0;
    this.sentTextTokens.length = 0;
    this.sentEndSessions.length = 0;
    this.isClosed = false;
    this.closeReason = undefined;
  }

  private assertBoundaryAttached(): void {
    if (!this.boundary) {
      throw new Error('FakeTwilioConversationRelaySimulator: boundary not attached');
    }
  }
}
