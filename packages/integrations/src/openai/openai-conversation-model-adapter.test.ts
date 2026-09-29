import type { ConversationModelInput, ModelStreamEvent } from '@voice-agent/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { OpenAiChatCompletionRequest } from './openai-chat-completion-types.js';
import { OpenAiConversationModelAdapter } from './openai-conversation-model-adapter.js';

function createSseChunk(content?: string, finishReason?: string | null): string {
  const payload = {
    choices: [
      {
        index: 0,
        delta: content !== undefined ? { content } : {},
        finish_reason: finishReason ?? null,
      },
    ],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function createSseUsageChunk(prompt: number, completion: number): string {
  const payload = {
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage: {
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: prompt + completion,
    },
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function makeSseResponse(sseText: string, status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sseText));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

const mockInput: ConversationModelInput = {
  organizationId: 'org_test_123',
  turnId: 'turn_1',
  generationId: 'gen_1',
  agentSnapshot: {
    persona: {
      role: 'Vendedor',
      companyName: 'Empresa',
      objective: 'Vender planos',
      tone: 'OBJECTIVE',
      greetingPhrase: 'Olá!',
      closingPhrase: 'Tchau!',
      fallbackPhrase: 'Não entendi',
    },
    voice: { languageCode: 'pt-BR' },
    rules: { conversational: ['Não inventar descontos'], deterministic: {} },
    playbook: { stages: [] },
    examples: [],
  },
  messages: [{ role: 'user', content: 'Olá, gostaria de saber preços.' }],
};

describe('OpenAiConversationModelAdapter', () => {
  it('maps instructions, history and caller input correctly in request body', async () => {
    let capturedBody: OpenAiChatCompletionRequest | null = null;
    const fakeFetch = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as OpenAiChatCompletionRequest;
      return makeSseResponse(createSseChunk('Olá!') + 'data: [DONE]\n\n');
    });

    const adapter = new OpenAiConversationModelAdapter({
      config: { modelId: 'gpt-4o', apiKey: 'test_key', apiBaseUrl: 'https://api.openai.com/v1' },
      fetchFn: fakeFetch,
    });

    const stream = await adapter.streamTurn(mockInput);
    const events: ModelStreamEvent[] = [];
    for await (const ev of stream) events.push(ev);

    expect(capturedBody).not.toBeNull();
    const req = capturedBody as unknown as OpenAiChatCompletionRequest;
    expect(req.model).toBe('gpt-4o');
    expect(req.stream).toBe(true);
    expect(req.messages[0]?.role).toBe('system');
    expect(req.messages[0]?.content).toContain('Vendedor');
    expect(req.messages[1]?.role).toBe('user');
    expect(req.messages[1]?.content).toBe('Olá, gostaria de saber preços.');
  });

  it('streams text deltas incrementally and emits usage and completed once', async () => {
    const sse =
      createSseChunk('Olá') +
      createSseChunk(' mundo!') +
      createSseUsageChunk(12, 4) +
      'data: [DONE]\n\n';

    const fakeFetch = vi.fn().mockResolvedValue(makeSseResponse(sse));
    const adapter = new OpenAiConversationModelAdapter({
      config: { modelId: 'gpt-4o' },
      fetchFn: fakeFetch,
    });

    const stream = await adapter.streamTurn(mockInput);
    const events: ModelStreamEvent[] = [];
    for await (const ev of stream) events.push(ev);

    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({
      type: 'text.delta',
      textDelta: 'Olá',
      turnId: 'turn_1',
      generationId: 'gen_1',
      isFinal: false,
    });
    expect(events[1]).toEqual({
      type: 'text.delta',
      textDelta: ' mundo!',
      turnId: 'turn_1',
      generationId: 'gen_1',
      isFinal: false,
    });
    expect(events[2]).toEqual({
      type: 'usage',
      turnId: 'turn_1',
      generationId: 'gen_1',
      inputTokens: 12,
      outputTokens: 4,
    });
    expect(events[3]).toEqual({
      type: 'completed',
      turnId: 'turn_1',
      generationId: 'gen_1',
      fullText: 'Olá mundo!',
    });
  });

  it('maps HTTP errors to safe failure event and terminates stream', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const adapter = new OpenAiConversationModelAdapter({
      fetchFn: fakeFetch,
      config: { modelId: 'gpt-4o' },
    });

    const stream = await adapter.streamTurn(mockInput);
    const events: ModelStreamEvent[] = [];
    for await (const ev of stream) events.push(ev);

    expect(events).toHaveLength(1);
    const firstEvent = events[0];
    expect(firstEvent).toBeDefined();
    if (firstEvent && firstEvent.type === 'failure') {
      expect(firstEvent.error).toContain('authentication failed');
      expect(firstEvent.isRetryable).toBe(false);
    }
  });

  it('propagates abort signal and discards subsequent chunks', async () => {
    const controller = new AbortController();
    const sse =
      createSseChunk('A') + createSseChunk('B') + createSseChunk('C') + 'data: [DONE]\n\n';
    const fakeFetch = vi.fn().mockResolvedValue(makeSseResponse(sse));
    const adapter = new OpenAiConversationModelAdapter({
      fetchFn: fakeFetch,
      config: { modelId: 'gpt-4o' },
    });

    const stream = await adapter.streamTurn(mockInput, { signal: controller.signal });
    const events: ModelStreamEvent[] = [];
    for await (const ev of stream) {
      events.push(ev);
      controller.abort();
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'text.delta',
      textDelta: 'A',
      turnId: 'turn_1',
      generationId: 'gen_1',
      isFinal: false,
    });
  });

  it('terminates fail-closed on malformed JSON data frame and suppresses later deltas', async () => {
    const sse =
      createSseChunk('Antes') +
      'data: {invalid-json-structure\n\n' +
      createSseChunk('Depois') +
      'data: [DONE]\n\n';

    const fakeFetch = vi.fn().mockResolvedValue(makeSseResponse(sse));
    const adapter = new OpenAiConversationModelAdapter({
      fetchFn: fakeFetch,
      config: { modelId: 'gpt-4o' },
    });

    const stream = await adapter.streamTurn(mockInput);
    const events: ModelStreamEvent[] = [];
    for await (const ev of stream) events.push(ev);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'text.delta',
      textDelta: 'Antes',
      turnId: 'turn_1',
      generationId: 'gen_1',
      isFinal: false,
    });
    expect(events[1]?.type).toBe('failure');
    if (events[1]?.type === 'failure') {
      expect(events[1].error).toContain('malformed SSE data frame');
      expect(events[1].isRetryable).toBe(false);
    }
  });

  it('fails safely when stream closes prematurely without terminal marker', async () => {
    const sse = createSseChunk('Texto sem finalizacao');
    const fakeFetch = vi.fn().mockResolvedValue(makeSseResponse(sse));
    const adapter = new OpenAiConversationModelAdapter({
      fetchFn: fakeFetch,
      config: { modelId: 'gpt-4o' },
    });

    const stream = await adapter.streamTurn(mockInput);
    const events: ModelStreamEvent[] = [];
    for await (const ev of stream) events.push(ev);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'text.delta',
      textDelta: 'Texto sem finalizacao',
      turnId: 'turn_1',
      generationId: 'gen_1',
      isFinal: false,
    });
    expect(events[1]?.type).toBe('failure');
    if (events[1]?.type === 'failure') {
      expect(events[1].error).toContain('stream closed prematurely');
      expect(events[1].isRetryable).toBe(true);
    }
  });

  it('ignores post-terminal data without emitting additional text deltas or completed events', async () => {
    const sse =
      createSseChunk('Correto') +
      'data: [DONE]\n\n' +
      createSseChunk('Fantasma') +
      'data: [DONE]\n\n';

    const fakeFetch = vi.fn().mockResolvedValue(makeSseResponse(sse));
    const adapter = new OpenAiConversationModelAdapter({
      fetchFn: fakeFetch,
      config: { modelId: 'gpt-4o' },
    });

    const stream = await adapter.streamTurn(mockInput);
    const events: ModelStreamEvent[] = [];
    for await (const ev of stream) events.push(ev);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'text.delta',
      textDelta: 'Correto',
      turnId: 'turn_1',
      generationId: 'gen_1',
      isFinal: false,
    });
    expect(events[1]).toEqual({
      type: 'completed',
      turnId: 'turn_1',
      generationId: 'gen_1',
      fullText: 'Correto',
    });
  });
});
