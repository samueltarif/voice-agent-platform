import type {
  ConversationModelInput,
  ConversationModelPort,
  ConversationTextChunk,
} from '@voice-agent/contracts';

export class FakeConversationModel implements ConversationModelPort {
  readonly providerName = 'fake-model';
  shouldFail = false;
  responseChunks: string[] = ['Olá! ', 'Como posso ', 'ajudar você hoje?'];
  onChunkYield?: (chunk: ConversationTextChunk) => Promise<void> | void;

  async streamTurn(input: ConversationModelInput): Promise<AsyncIterable<ConversationTextChunk>> {
    if (this.shouldFail) {
      throw new Error('Fake model generation failure');
    }

    const chunks = [...this.responseChunks];
    const { turnId, generationId } = input;
    const onYield = this.onChunkYield;

    return {
      async *[Symbol.asyncIterator]() {
        for (let i = 0; i < chunks.length; i++) {
          const textDelta = chunks[i] ?? '';
          const isFinal = i === chunks.length - 1;
          const chunk: ConversationTextChunk = {
            textDelta,
            turnId,
            generationId,
            isFinal,
          };
          if (onYield) {
            await onYield(chunk);
          }
          yield chunk;
        }
      },
    };
  }

  setResponse(text: string): void {
    this.responseChunks = [text];
  }
}
