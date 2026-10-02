import type { ConversationHistoryPort, VoiceTransportPort } from '@voice-agent/contracts';
import type { Logger } from '@voice-agent/logger';
import {
  type DispatchDeterministicResponseInput,
  type DispatchDeterministicResponseResult,
  type PendingDeterministicResponse,
  dispatchDeterministicResponse,
  resolveConversationalCompletion,
  resolveInterruptedHistory,
} from './deterministic-response-delivery.js';

export interface DeterministicDeliveryCoordinatorDependencies {
  readonly transport: VoiceTransportPort;
  readonly historyStore: ConversationHistoryPort;
  readonly logger: Logger;
  readonly isGenerationActive: (callId: string, genId: string) => boolean;
}

export class DeterministicResponseDeliveryCoordinator {
  private readonly pendingResponses = new Map<string, PendingDeterministicResponse>();
  private readonly deps: DeterministicDeliveryCoordinatorDependencies;

  constructor(deps: DeterministicDeliveryCoordinatorDependencies) {
    this.deps = deps;
  }

  async deliver(
    input: DispatchDeterministicResponseInput,
  ): Promise<DispatchDeterministicResponseResult> {
    const result = await dispatchDeterministicResponse(this.deps, input, this.pendingResponses);
    if (result.staleBefore) {
      this.deps.logger.info('deterministic.delivery.suppressed_stale', {
        callId: input.callId,
        organizationId: input.organizationId,
      });
    }
    return result;
  }

  async resolveOnUserSpeechFinal(session: {
    organizationId: string;
    callId: string;
  }): Promise<void> {
    const pending = this.pendingResponses.get(session.callId);
    if (!pending?.dispatched) return;

    await resolveConversationalCompletion(
      { historyStore: this.deps.historyStore, logger: this.deps.logger },
      pending,
      session,
    );
    this.pendingResponses.delete(session.callId);
  }

  async resolveOnInterruption(
    session: { organizationId: string; callId: string },
    interruptedUtterance?: string | undefined,
  ): Promise<void> {
    const pending = this.pendingResponses.get(session.callId);
    if (!pending) return;

    await resolveInterruptedHistory(
      { historyStore: this.deps.historyStore, logger: this.deps.logger },
      pending,
      { organizationId: session.organizationId, callId: session.callId, interruptedUtterance },
    );
    this.pendingResponses.delete(session.callId);
  }

  clearCall(callId: string): void {
    this.pendingResponses.delete(callId);
  }

  getPending(callId: string): PendingDeterministicResponse | undefined {
    return this.pendingResponses.get(callId);
  }
}
