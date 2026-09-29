import type {
  AgentConfigurationSnapshotV1,
  CallSession,
  ConversationHistoryPort,
  ConversationMessage,
  ConversationModelPort,
  VoiceTransportPort,
} from '@voice-agent/contracts';
import { ConversationModelError } from '@voice-agent/errors';
import type { Logger } from '@voice-agent/logger';
import { ConversationContextComposer } from './conversation-context-composer.js';
import { InMemoryConversationHistoryStore } from './in-memory-conversation-history-store.js';
import { processModelStream } from './process-model-stream.js';

export interface StreamTurnParams {
  readonly session: CallSession;
  readonly turnId: string;
  readonly generationId: string;
  readonly snapshot: AgentConfigurationSnapshotV1;
  readonly isGenerationActive: (callId: string, genId: string) => boolean;
  readonly callerTranscript?: string | undefined;
}

export interface AssistantStreamCoordinatorDependencies {
  readonly transport: VoiceTransportPort;
  readonly model: ConversationModelPort;
  readonly logger: Logger;
  readonly historyStore?: ConversationHistoryPort | undefined;
  readonly contextComposer?: ConversationContextComposer | undefined;
}

function turnMeta(session: CallSession, turnId: string, extra?: Record<string, unknown>) {
  return {
    callId: session.callId,
    organizationId: session.organizationId,
    turnId,
    ...extra,
  };
}

export class AssistantStreamCoordinator {
  private readonly transport: VoiceTransportPort;
  private readonly model: ConversationModelPort;
  private readonly logger: Logger;
  private readonly historyStore: ConversationHistoryPort;
  private readonly contextComposer: ConversationContextComposer;

  constructor(deps: AssistantStreamCoordinatorDependencies) {
    this.transport = deps.transport;
    this.model = deps.model;
    this.logger = deps.logger;
    this.historyStore = deps.historyStore ?? new InMemoryConversationHistoryStore();
    this.contextComposer = deps.contextComposer ?? new ConversationContextComposer();
  }

  async appendUserUtterance(session: CallSession, turnId: string, text: string): Promise<void> {
    await this.historyStore.appendTurn({
      organizationId: session.organizationId,
      callId: session.callId,
      turnId,
      role: 'user',
      content: text,
    });
  }

  private async prepareTurnContext(params: StreamTurnParams) {
    const history = await this.historyStore.listForCall({
      organizationId: params.session.organizationId,
      callId: params.session.callId,
    });
    const messages: ConversationMessage[] = history.map((r) => ({
      role: r.role,
      content: r.content,
      turnId: r.turnId,
    }));
    const context = this.contextComposer.composeContext({
      organizationId: params.session.organizationId,
      callId: params.session.callId,
      turnId: params.turnId,
      generationId: params.generationId,
      snapshot: params.snapshot,
      history,
      callerTranscript: params.callerTranscript ?? '',
    });
    return { messages, context };
  }

  private async recordTurnCompletion(
    session: CallSession,
    turnId: string,
    meta: { generationId: string; fullResponse: string; startTime: number },
  ) {
    await this.historyStore.appendTurn({
      organizationId: session.organizationId,
      callId: session.callId,
      turnId,
      role: 'assistant',
      content: meta.fullResponse,
    });
    this.logger.info(
      'call.turn.completed',
      turnMeta(session, turnId, {
        generationId: meta.generationId,
        durationMs: Date.now() - meta.startTime,
      }),
    );
  }

  async streamTurn(params: StreamTurnParams): Promise<void> {
    const { session, turnId, generationId, snapshot } = params;
    const startTime = Date.now();
    const { messages, context } = await this.prepareTurnContext(params);
    this.logger.info('call.turn.started', turnMeta(session, turnId, { generationId }));

    try {
      const stream = await this.model.streamTurn({
        organizationId: session.organizationId,
        agentSnapshot: snapshot,
        messages,
        turnId,
        generationId,
        context,
      });

      const fullResponse = await processModelStream({
        session,
        turnId,
        generationId,
        stream,
        transport: this.transport,
        logger: this.logger,
        isGenerationActive: params.isGenerationActive,
        startTime,
      });

      if (params.isGenerationActive(session.callId, generationId) && fullResponse) {
        await this.recordTurnCompletion(session, turnId, { generationId, fullResponse, startTime });
      }
    } catch (err) {
      if (err instanceof ConversationModelError) throw err;
      throw new ConversationModelError(
        err instanceof Error ? err.message : 'Model streaming error',
      );
    }
  }

  async clearHistory(organizationId: string, callId: string): Promise<void> {
    await this.historyStore.clearForCall(organizationId, callId);
  }
}
