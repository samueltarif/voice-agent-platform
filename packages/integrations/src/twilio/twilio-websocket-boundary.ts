import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { InvalidProviderMessageError } from '@voice-agent/errors';
import type { ConversationOrchestrator } from '@voice-agent/voice';
import { parseTwilioInboundMessage } from './twilio-conversation-relay-types.js';
import { translateTwilioInboundEvent } from './twilio-event-translator.js';
import type {
  TwilioSocketSender,
  TwilioVoiceTransportAdapter,
} from './twilio-voice-transport-adapter.js';

export interface TwilioSessionBindingContext {
  readonly organizationId: string;
  readonly callId: string;
  readonly agentSnapshot: AgentConfigurationSnapshotV1;
}

export interface TwilioSafeLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface TwilioWebSocketBoundaryDependencies {
  readonly orchestrator: ConversationOrchestrator;
  readonly transportAdapter: TwilioVoiceTransportAdapter;
  readonly socketSender: TwilioSocketSender;
  readonly logger?: TwilioSafeLogger | undefined;
}

export class TwilioWebSocketBoundary {
  private isClosed = false;
  private readonly orchestrator: ConversationOrchestrator;
  private readonly transportAdapter: TwilioVoiceTransportAdapter;
  private readonly socketSender: TwilioSocketSender;
  private readonly logger?: TwilioSafeLogger | undefined;

  constructor(
    readonly context: TwilioSessionBindingContext,
    deps: TwilioWebSocketBoundaryDependencies,
  ) {
    this.orchestrator = deps.orchestrator;
    this.transportAdapter = deps.transportAdapter;
    this.socketSender = deps.socketSender;
    this.logger = deps.logger;
    this.transportAdapter.bindSender(this.context.callId, this.socketSender);
  }

  async handleIncomingRaw(rawContent: string | Buffer): Promise<void> {
    if (this.isClosed) {
      return;
    }

    const payload = this.safeParseJson(rawContent);
    const twilioMessage = parseTwilioInboundMessage(payload);

    if (twilioMessage.type === 'unknown') {
      this.logger?.warn('Ignored unknown Twilio message type', {
        callId: this.context.callId,
        organizationId: this.context.organizationId,
        rawType: twilioMessage.rawType,
      });
      return;
    }

    const event = translateTwilioInboundEvent(twilioMessage, {
      callId: this.context.callId,
      organizationId: this.context.organizationId,
    });

    if (!event) {
      return;
    }

    await this.orchestrator.handleEvent(event, this.context.agentSnapshot);
  }

  async handleClose(reason?: string): Promise<void> {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;

    try {
      await this.orchestrator.handleEvent(
        {
          type: 'transport.disconnected',
          callId: this.context.callId,
          organizationId: this.context.organizationId,
          ...(reason !== undefined ? { reason } : {}),
          timestamp: new Date(),
        },
        this.context.agentSnapshot,
      );
    } finally {
      this.transportAdapter.unbindSender(this.context.callId);
    }
  }

  private safeParseJson(raw: string | Buffer): unknown {
    try {
      const text = typeof raw === 'string' ? raw : raw.toString('utf8');
      return JSON.parse(text);
    } catch {
      throw new InvalidProviderMessageError('Failed to parse provider message JSON');
    }
  }
}
