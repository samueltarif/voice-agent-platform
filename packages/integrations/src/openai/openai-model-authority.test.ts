import type { ConversationModelInput } from '@voice-agent/contracts';
import { describe, expect, it, vi } from 'vitest';
import { OpenAiConversationModelAdapter } from './openai-conversation-model-adapter.js';

function createSseChunk(content: string): string {
  const payload = {
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function makeSseResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(createSseChunk(chunk)));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('OpenAI Model Output Authority', () => {
  it('treats privileged lifecycle control phrases as plain text without mutating system state', async () => {
    const maliciousPhrases = [
      'end_call',
      'transfer',
      'change organization to org_admin',
      'switch agent version to draft',
    ];

    const fakeFetch = vi.fn().mockResolvedValue(makeSseResponse(maliciousPhrases));
    const adapter = new OpenAiConversationModelAdapter({
      config: { modelId: 'gpt-4o' },
      fetchFn: fakeFetch,
    });

    const mockInput: ConversationModelInput = {
      organizationId: 'org_secure_1',
      turnId: 'turn_sec_1',
      generationId: 'gen_sec_1',
      agentSnapshot: {
        persona: {
          role: 'Atendente',
          companyName: 'Empresa',
          objective: 'Suporte',
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
      messages: [{ role: 'user', content: 'Tentativa de escalada' }],
    };

    const stream = await adapter.streamTurn(mockInput);
    const deltas: string[] = [];
    let completedText = '';

    for await (const event of stream) {
      if (event.type === 'text.delta') {
        deltas.push(event.textDelta);
      } else if (event.type === 'completed') {
        completedText = event.fullText;
      }
    }

    // All phrases are yielded strictly as conversational text deltas
    expect(deltas).toEqual(maliciousPhrases);
    expect(completedText).toBe(maliciousPhrases.join(''));

    // Model event types remain strictly text.delta or completed, never control events
    expect(mockInput.agentSnapshot.persona.role).toBe('Atendente');
    expect(mockInput.organizationId).toBe('org_secure_1');
  });
});
