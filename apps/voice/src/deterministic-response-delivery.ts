import type { ConversationHistoryPort, VoiceTransportPort } from '@voice-agent/contracts';
import type { Logger } from '@voice-agent/logger';

/**
 * Minimal ephemeral pending response state per callId.
 * NOT persisted to DB. NOT logged with fullText.
 */
export interface PendingDeterministicResponse {
  readonly generationId: string;
  /** turnId of the ASSISTANT turn (not the next user turn). */
  readonly assistantTurnId: string;
  readonly fullText: string;
  readonly dispatched: boolean;
}

export interface DeterministicDeliveryDeps {
  readonly transport: VoiceTransportPort;
  readonly historyStore: ConversationHistoryPort;
  readonly logger: Logger;
  readonly isGenerationActive: (callId: string, genId: string) => boolean;
}

/** Context grouping historyStore + logger for history resolution functions. */
export interface HistoryResolutionContext {
  readonly historyStore: ConversationHistoryPort;
  readonly logger: Logger;
}

export interface DispatchDeterministicResponseInput {
  readonly organizationId: string;
  readonly callId: string;
  readonly assistantTurnId: string;
  readonly generationId: string;
  readonly responseText: string;
}

export interface DispatchDeterministicResponseResult {
  readonly dispatched: boolean;
  readonly staleBefore?: true;
  readonly transportError?: Error;
}

export interface ResolveInterruptedHistoryInput {
  readonly organizationId: string;
  readonly callId: string;
  readonly interruptedUtterance?: string | undefined;
}

/**
 * OPTION_B ownership commit: sets pending entry BEFORE speak().
 * Pre-dispatch staleness guard: if generationId inactive, speak() is NOT called.
 * Transport error after commit: no OpenAI fallback, no history persisted.
 */
export async function dispatchDeterministicResponse(
  deps: DeterministicDeliveryDeps,
  input: DispatchDeterministicResponseInput,
  pendingResponses: Map<string, PendingDeterministicResponse>,
): Promise<DispatchDeterministicResponseResult> {
  const { organizationId, callId, assistantTurnId, generationId, responseText } = input;

  if (!deps.isGenerationActive(callId, generationId)) {
    deps.logger.info('deterministic.dispatch.stale_before_commit', {
      callId,
      organizationId,
      assistantTurnId,
      generationId,
    });
    return { dispatched: false, staleBefore: true };
  }

  // OPTION_B: commit ownership immediately before speak(); OPENAI_FALLBACK = PROHIBITED
  pendingResponses.set(callId, {
    generationId,
    assistantTurnId,
    fullText: responseText,
    dispatched: true,
  });

  try {
    await deps.transport.speak(callId, { text: responseText, generationId, isFinal: true });
    deps.logger.info('deterministic.dispatch.accepted', {
      callId,
      organizationId,
      assistantTurnId,
      generationId,
    });
    return { dispatched: true };
  } catch (err) {
    // Transport error after ownership commit: NO OpenAI fallback; log without response text.
    const error = err instanceof Error ? err : new Error('Deterministic transport error');
    deps.logger.error('deterministic.dispatch.transport_error', {
      callId,
      organizationId,
      assistantTurnId,
      generationId,
      errorMessage: error.message,
    });
    return { dispatched: true, transportError: error };
  }
}

/**
 * H4: interruptedUtterance non-empty → partial assistant turn (isInterrupted=true).
 * H5: interruptedUtterance absent/empty → do NOT persist; no fabricated partial.
 * ACOUSTIC_PLAYBACK_COMPLETION = NOT VERIFIED.
 */
export async function resolveInterruptedHistory(
  ctx: HistoryResolutionContext,
  pending: PendingDeterministicResponse,
  input: ResolveInterruptedHistoryInput,
): Promise<void> {
  const { organizationId, callId, interruptedUtterance } = input;

  if (typeof interruptedUtterance === 'string' && interruptedUtterance.length > 0) {
    await ctx.historyStore.appendTurn({
      organizationId,
      callId,
      turnId: pending.assistantTurnId,
      role: 'assistant',
      content: interruptedUtterance,
      isInterrupted: true,
    });
    ctx.logger.info('deterministic.history.h4_interrupted', {
      callId,
      organizationId,
      assistantTurnId: pending.assistantTurnId,
    });
    return;
  }

  // H5: no metadata → clear silently, full text NOT persisted
  ctx.logger.info('deterministic.history.h5_no_metadata', {
    callId,
    organizationId,
    assistantTurnId: pending.assistantTurnId,
  });
}

/**
 * Inferred non-interrupted conversational completion.
 * HISTORY_CONVERSATIONAL_COMPLETION = inferred from no interruption before next user turn.
 * ACOUSTIC_PLAYBACK_COMPLETION = NOT VERIFIED.
 */
export async function resolveConversationalCompletion(
  ctx: HistoryResolutionContext,
  pending: PendingDeterministicResponse,
  params: { organizationId: string; callId: string },
): Promise<void> {
  const { organizationId, callId } = params;
  await ctx.historyStore.appendTurn({
    organizationId,
    callId,
    turnId: pending.assistantTurnId,
    role: 'assistant',
    content: pending.fullText,
    isInterrupted: false,
  });
  ctx.logger.info('deterministic.history.conversational_completion', {
    callId,
    organizationId,
    assistantTurnId: pending.assistantTurnId,
    note: 'ACOUSTIC_PLAYBACK_COMPLETION=NOT_VERIFIED',
  });
}
