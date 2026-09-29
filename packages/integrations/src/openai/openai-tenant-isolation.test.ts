import type { ConversationModelInput } from '@voice-agent/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { OpenAiChatCompletionRequest } from './openai-chat-completion-types.js';
import { OpenAiConversationModelAdapter } from './openai-conversation-model-adapter.js';

function createSseChunk(content: string): string {
  const payload = {
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function makeSseResponse(text: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(createSseChunk(text) + 'data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('OpenAI Tenant Isolation', () => {
  it('preserves organization context separation and prevents cross-tenant data leakage', async () => {
    const receivedRequests: Array<{ url: string; body: OpenAiChatCompletionRequest }> = [];

    const fakeFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      receivedRequests.push({
        url,
        body: JSON.parse(init.body as string) as OpenAiChatCompletionRequest,
      });
      return makeSseResponse('Resposta');
    });

    const adapter = new OpenAiConversationModelAdapter({
      config: { modelId: 'gpt-4o' },
      fetchFn: fakeFetch,
    });

    const tenantAInput: ConversationModelInput = {
      organizationId: 'org_tenant_A',
      turnId: 'turn_1',
      generationId: 'gen_1',
      agentSnapshot: {
        persona: {
          role: 'Vendedor Imobiliário',
          companyName: 'Empresa A',
          objective: 'Vender apartamentos',
          tone: 'FORMAL',
          greetingPhrase: 'Olá!',
          closingPhrase: 'Tchau!',
          fallbackPhrase: 'Não entendi',
        },
        voice: { languageCode: 'pt-BR' },
        rules: { conversational: ['Regra A'], deterministic: {} },
        playbook: { stages: [] },
        examples: [],
      },
      messages: [{ role: 'user', content: 'Tenho interesse no imóvel A' }],
    };

    const tenantBInput: ConversationModelInput = {
      organizationId: 'org_tenant_B',
      turnId: 'turn_1',
      generationId: 'gen_1',
      agentSnapshot: {
        persona: {
          role: 'Suporte Técnico',
          companyName: 'Empresa B',
          objective: 'Resolver incidentes',
          tone: 'OBJECTIVE',
          greetingPhrase: 'Olá!',
          closingPhrase: 'Tchau!',
          fallbackPhrase: 'Não entendi',
        },
        voice: { languageCode: 'pt-BR' },
        rules: { conversational: ['Regra B'], deterministic: {} },
        playbook: { stages: [] },
        examples: [],
      },
      messages: [{ role: 'user', content: 'Minha internet caiu' }],
    };

    // Execute streams for both tenants with same turnId/genId
    const streamA = await adapter.streamTurn(tenantAInput);
    const eventsA = [];
    for await (const ev of streamA) {
      eventsA.push(ev);
    }
    expect(eventsA.length).toBeGreaterThan(0);

    const streamB = await adapter.streamTurn(tenantBInput);
    const eventsB = [];
    for await (const ev of streamB) {
      eventsB.push(ev);
    }
    expect(eventsB.length).toBeGreaterThan(0);

    expect(receivedRequests).toHaveLength(2);

    // Verify Tenant A request contains only Tenant A data
    const reqA = receivedRequests[0]?.body;
    expect(reqA).toBeDefined();
    expect(reqA?.messages[0]?.content).toContain('Vendedor Imobiliário');
    expect(reqA?.messages[0]?.content).not.toContain('Suporte Técnico');
    expect(reqA?.messages[1]?.content).toBe('Tenho interesse no imóvel A');

    // Verify Tenant B request contains only Tenant B data
    const reqB = receivedRequests[1]?.body;
    expect(reqB).toBeDefined();
    expect(reqB?.messages[0]?.content).toContain('Suporte Técnico');
    expect(reqB?.messages[0]?.content).not.toContain('Vendedor Imobiliário');
    expect(reqB?.messages[1]?.content).toBe('Minha internet caiu');
  });
});
