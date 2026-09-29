import type { ConversationModelInput } from '@voice-agent/contracts';
import { describe, expect, it, vi } from 'vitest';
import { OpenAiConversationModelAdapter } from './openai-conversation-model-adapter.js';

function createSseChunk(content: string): string {
  const payload = {
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function makeSseResponse(sseText: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sseText));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('OpenAI FullText Accumulation Regression', () => {
  it('guarantees completed fullText equals deterministic accepted accumulation of deltas', async () => {
    const rawChunks = ['Olá', ' ', 'como', ' vai?'];
    const sse = rawChunks.map((c) => createSseChunk(c)).join('') + 'data: [DONE]\n\n';

    const fakeFetch = vi.fn().mockResolvedValue(makeSseResponse(sse));
    const adapter = new OpenAiConversationModelAdapter({
      config: { modelId: 'gpt-4o' },
      fetchFn: fakeFetch,
    });

    const mockInput: ConversationModelInput = {
      organizationId: 'org_reg_1',
      turnId: 'turn_ft_1',
      generationId: 'gen_ft_1',
      agentSnapshot: {
        persona: {
          role: 'Assistente',
          companyName: 'Empresa',
          objective: 'Ajudar',
          tone: 'OBJECTIVE',
          greetingPhrase: 'Olá!',
          closingPhrase: 'Tchau!',
          fallbackPhrase: 'Não entendi',
        },
        voice: { languageCode: 'pt-BR' },
        rules: { conversational: [], deterministic: {} },
        playbook: { stages: [] },
        examples: [],
      },
      messages: [{ role: 'user', content: 'Oi' }],
    };

    const stream = await adapter.streamTurn(mockInput);
    const deltas: string[] = [];
    let completedFullText = '';

    for await (const event of stream) {
      if (event.type === 'text.delta') {
        deltas.push(event.textDelta);
      } else if (event.type === 'completed') {
        completedFullText = event.fullText;
      }
    }

    const deterministicExpected = rawChunks.join('');
    expect(deterministicExpected).toBe('Olá como vai?');
    expect(deltas).toEqual(['Olá', ' ', 'como', ' vai?']);
    expect(deltas.join('')).toBe(deterministicExpected);
    expect(completedFullText).toBe(deterministicExpected);
  });
});
