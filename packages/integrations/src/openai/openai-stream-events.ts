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

interface StreamEndContext {
  readonly terminalReceived: boolean;
  readonly accumulatedText: string;
  readonly turnId: string;
  readonly generationId: string;
}

function checkStreamEnd(ctx: StreamEndContext): ModelStreamEvent {
  if (!ctx.terminalReceived) {
    return {
      type: 'failure',
      turnId: ctx.turnId,
      generationId: ctx.generationId,
      error: 'OpenAI protocol failure: stream closed prematurely without terminal marker',
      isRetryable: true,
    };
  }
  return {
    type: 'completed',
    turnId: ctx.turnId,
    generationId: ctx.generationId,
    fullText: ctx.accumulatedText,
  };
}

function applyChunkEvents(
  chunk: OpenAiChatCompletionChunk,
  turnId: string,
  generationId: string,
): { readonly text: string; readonly events: ModelStreamEvent[] } {
  const { text, usageEvent } = extractChunkEvents(chunk, turnId, generationId);
  const events: ModelStreamEvent[] = [];
  const textValue = text ?? '';
  if (textValue) {
    events.push({ type: 'text.delta', textDelta: textValue, turnId, generationId, isFinal: false });
  }
  if (usageEvent) {
    events.push(usageEvent);
  }
  return { text: textValue, events };
}

export async function* streamFromChunks(params: ConsumeSseParams): AsyncIterable<ModelStreamEvent> {
  const { body, turnId, generationId, signal } = params;
  let accumulatedText = '';
  let terminalReceived = false;

  for await (const item of parseOpenAiSseStream(body)) {
    if (signal?.aborted) return;

    if (item.kind === 'done') {
      terminalReceived = true;
      break;
    }

    if (item.kind === 'malformed') {
      yield {
        type: 'failure',
        turnId,
        generationId,
        error: 'OpenAI protocol failure: malformed SSE data frame',
        isRetryable: false,
      };
      return;
    }

    const { text, events } = applyChunkEvents(item.chunk, turnId, generationId);
    accumulatedText += text;
    yield* events;
  }

  if (signal?.aborted) return;
  yield checkStreamEnd({ terminalReceived, accumulatedText, turnId, generationId });
}
