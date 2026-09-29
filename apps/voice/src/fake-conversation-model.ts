import type {
  ConversationModelInput,
  ConversationModelPort,
  ConversationTextChunk,
  ModelStreamEvent,
} from '@voice-agent/contracts';

interface StreamChunkMeta {
  readonly turnId: string;
  readonly generationId: string;
  readonly delayMs: number;
}

type YieldHandler =
  ((c: ConversationTextChunk | ModelStreamEvent) => Promise<void> | void) | undefined;

async function* emitStructured(
  chunks: readonly string[],
  meta: StreamChunkMeta,
  onYield: YieldHandler,
): AsyncIterable<ModelStreamEvent> {
  let accumulated = '';
  for (let i = 0; i < chunks.length; i++) {
    if (meta.delayMs > 0) await new Promise((r) => setTimeout(r, meta.delayMs));
    const textDelta = chunks[i] ?? '';
    accumulated += textDelta;
    const isFinal = i === chunks.length - 1;
    const event: ModelStreamEvent = {
      type: 'text.delta',
      textDelta,
      turnId: meta.turnId,
      generationId: meta.generationId,
      isFinal,
    };
    if (onYield) await onYield(event);
    yield event;
    if (isFinal) {
      const completed: ModelStreamEvent = {
        type: 'completed',
        turnId: meta.turnId,
        generationId: meta.generationId,
        fullText: accumulated,
      };
      if (onYield) await onYield(completed);
      yield completed;
    }
  }
}

async function* emitLegacy(
  chunks: readonly string[],
  meta: StreamChunkMeta,
  onYield: YieldHandler,
): AsyncIterable<ConversationTextChunk> {
  for (let i = 0; i < chunks.length; i++) {
    if (meta.delayMs > 0) await new Promise((r) => setTimeout(r, meta.delayMs));
    const chunk: ConversationTextChunk = {
      textDelta: chunks[i] ?? '',
      turnId: meta.turnId,
      generationId: meta.generationId,
      isFinal: i === chunks.length - 1,
    };
    if (onYield) await onYield(chunk);
    yield chunk;
  }
}

export class FakeConversationModel implements ConversationModelPort {
  readonly providerName = 'fake-model';
  shouldFail = false;
  failureMessage = 'Fake model generation failure';
  responseChunks: string[] = ['Olá! ', 'Como posso ', 'ajudar você hoje?'];
  recordedInputs: ConversationModelInput[] = [];
  onChunkYield?: YieldHandler;
  emitStructuredEvents = false;
  delayMs = 0;

  private pausePromise: Promise<void> | null = null;
  private pauseResolver: (() => void) | null = null;

  pause(): void {
    this.pausePromise = new Promise<void>((resolve) => {
      this.pauseResolver = resolve;
    });
  }

  resume(): void {
    if (this.pauseResolver) {
      this.pauseResolver();
      this.pausePromise = null;
      this.pauseResolver = null;
    }
  }

  async streamTurn(
    input: ConversationModelInput,
  ): Promise<AsyncIterable<ConversationTextChunk | ModelStreamEvent>> {
    this.recordedInputs.push(input);
    if (this.shouldFail) throw new Error(this.failureMessage);
    if (this.pausePromise) await this.pausePromise;

    const meta: StreamChunkMeta = {
      turnId: input.turnId,
      generationId: input.generationId,
      delayMs: this.delayMs,
    };

    if (this.emitStructuredEvents) {
      return emitStructured(this.responseChunks, meta, this.onChunkYield);
    }
    return emitLegacy(this.responseChunks, meta, this.onChunkYield);
  }

  setResponse(text: string): void {
    this.responseChunks = [text];
  }
}
