import type { ModelStreamEvent } from '@voice-agent/contracts';
import type { OpenAiChatCompletionChunk } from './openai-chat-completion-types.js';
import { parseOpenAiSseStream } from './openai-sse-parser.js';

export interface ConsumeSseParams {
  readonly body: ReadableStream<Uint8Array>;
  readonly turnId: string;
  readonly generationId: string;
  readonly signal?: AbortSignal | undefined;
}

export function extractChunkEvents(
  chunk: OpenAiChatCompletionChunk,
  turnId: string,
  generationId: string,
): { readonly text?: string | undefined; readonly usageEvent?: ModelStreamEvent | undefined } {
  const text = chunk.choices?.[0]?.delta?.content ?? undefined;
  const usage = chunk.usage;
  const usageEvent: ModelStreamEvent | undefined = usage
    ? {
        type: 'usage',
        turnId,
        generationId,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
      }
    : undefined;

  return { text: typeof text === 'string' && text.length > 0 ? text : undefined, usageEvent };
}

export async function* streamFromChunks(params: ConsumeSseParams): AsyncIterable<ModelStreamEvent> {
  const { body, turnId, generationId, signal } = params;
  let accumulatedText = '';
  for await (const chunk of parseOpenAiSseStream(body)) {
    if (signal?.aborted) return;

    const { text, usageEvent } = extractChunkEvents(chunk, turnId, generationId);
    if (text) {
      accumulatedText += text;
      yield { type: 'text.delta', textDelta: text, turnId, generationId, isFinal: false };
    }
    if (usageEvent) yield usageEvent;
  }

  yield { type: 'completed', turnId, generationId, fullText: accumulatedText };
}
