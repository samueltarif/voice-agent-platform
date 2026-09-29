import type { ConversationTextChunk, ModelStreamEvent } from '@voice-agent/contracts';

export interface ModelTextDeltaResult {
  readonly text: string;
  readonly isFinal: boolean;
}

export function extractModelTextDelta(
  chunkOrEvent: ConversationTextChunk | ModelStreamEvent,
): ModelTextDeltaResult | null {
  if ('type' in chunkOrEvent) {
    if (chunkOrEvent.type === 'text.delta') {
      return { text: chunkOrEvent.textDelta, isFinal: chunkOrEvent.isFinal ?? false };
    }
    return null;
  }
  return { text: chunkOrEvent.textDelta, isFinal: chunkOrEvent.isFinal };
}
