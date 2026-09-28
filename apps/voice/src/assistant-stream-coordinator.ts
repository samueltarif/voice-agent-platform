import type {
  AgentConfigurationSnapshotV1,
  CallSession,
  ConversationMessage,
  ConversationModelPort,
  VoiceTransportPort,
} from '@voice-agent/contracts';
import { ConversationModelError } from '@voice-agent/errors';
import type { Logger } from '@voice-agent/logger';

export interface StreamTurnParams {
  readonly session: CallSession;
  readonly turnId: string;
  readonly generationId: string;
  readonly snapshot: AgentConfigurationSnapshotV1;
  readonly isGenerationActive: (callId: string, genId: string) => boolean;
}

export class AssistantStreamCoordinator {
  private readonly messageHistory = new Map<string, ConversationMessage[]>();

  constructor(
    private readonly transport: VoiceTransportPort,
    private readonly model: ConversationModelPort,
    private readonly logger: Logger,
  ) {}

  getOrCreateHistory(callId: string): ConversationMessage[] {
    let history = this.messageHistory.get(callId);
    if (!history) {
      history = [];
      this.messageHistory.set(callId, history);
    }
    return history;
  }

  async streamTurn(params: StreamTurnParams): Promise<void> {
    const { session, turnId, generationId, snapshot, isGenerationActive } = params;
    const history = this.getOrCreateHistory(session.callId);

    try {
      const stream = await this.model.streamTurn({
        organizationId: session.organizationId,
        agentSnapshot: snapshot,
        messages: [...history],
        turnId,
        generationId,
      });

      let fullResponse = '';
      for await (const chunk of stream) {
        if (!isGenerationActive(session.callId, generationId)) {
          this.logger.info('Discarding stale chunk due to barge-in', {
            callId: session.callId,
            generationId,
          });
          break;
        }

        fullResponse += chunk.textDelta;
        await this.transport.speak(session.callId, {
          text: chunk.textDelta,
          generationId,
          isFinal: chunk.isFinal,
        });
      }

      if (isGenerationActive(session.callId, generationId) && fullResponse) {
        history.push({ role: 'assistant', content: fullResponse, turnId });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Model streaming error';
      throw new ConversationModelError(message);
    }
  }

  clearHistory(callId: string): void {
    this.messageHistory.delete(callId);
  }
}
