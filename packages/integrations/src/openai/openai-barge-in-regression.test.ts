import type { AgentConfigurationSnapshotV1, VoiceTransportPort } from '@voice-agent/contracts';
import type { Logger } from '@voice-agent/logger';
import {
  AssistantStreamCoordinator,
  createCallSession,
  InMemoryConversationHistoryStore,
} from '@voice-agent/voice';
import { describe, expect, it, vi } from 'vitest';
import type { OpenAiChatCompletionRequest } from './openai-chat-completion-types.js';
import { OpenAiConversationModelAdapter } from './openai-conversation-model-adapter.js';

function createSseChunk(content: string): string {
  const payload = {
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

describe('OpenAI Barge-in Regression', () => {
  it('discards late chunks on interruption and prevents partial text from entering history', async () => {
    let callActiveGen = 'gen_A';
    const spokenChunks: string[] = [];
    let releaseLateA2: (() => void) | null = null;
    const lateA2Promise = new Promise<void>((resolve) => {
      releaseLateA2 = resolve;
    });

    const mockTransport: VoiceTransportPort = {
      providerName: 'mock-transport',
      speak: vi.fn().mockImplementation(async (_callId, cmd) => {
        spokenChunks.push(cmd.text);
        if (cmd.text === 'A1_delta') {
          // Caller interrupts speech on generation A
          callActiveGen = 'gen_B';
          // Release late chunk A2 now that generation A is invalid
          releaseLateA2?.();
        }
      }),
      interruptSpeech: vi.fn(),
      endCall: vi.fn(),
    };

    const mockLogger: Logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const encoder = new TextEncoder();
    const fakeFetch = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as OpenAiChatCompletionRequest;
      const isGenA = body.messages.some((m) => m.content.includes('primeira'));

      if (isGenA) {
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(encoder.encode(createSseChunk('A1_delta')));
            await lateA2Promise;
            controller.enqueue(encoder.encode(createSseChunk('A2_late_delta')));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }

      const streamB = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(createSseChunk('B1_normal')));
          controller.enqueue(encoder.encode(createSseChunk('B2_normal')));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(streamB, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });

    const adapter = new OpenAiConversationModelAdapter({
      config: { modelId: 'gpt-4o' },
      fetchFn: fakeFetch,
    });

    const historyStore = new InMemoryConversationHistoryStore();
    const coordinator = new AssistantStreamCoordinator({
      transport: mockTransport,
      model: adapter,
      logger: mockLogger,
      historyStore,
    });

    const session = createCallSession({
      callId: '00000000-0000-0000-0000-000000000001',
      organizationId: '11111111-1111-1111-1111-111111111111',
      agentId: '22222222-2222-2222-2222-222222222222',
      agentVersionId: '33333333-3333-3333-3333-333333333333',
      agentVersionStatus: 'PUBLISHED',
    });

    const snapshot: AgentConfigurationSnapshotV1 = {
      persona: {
        role: 'Vendedor',
        companyName: 'Empresa',
        objective: 'Vendas',
        tone: 'OBJECTIVE',
        greetingPhrase: 'Olá!',
        closingPhrase: 'Tchau!',
        fallbackPhrase: 'Não entendi',
      },
      voice: { languageCode: 'pt-BR' },
      rules: { conversational: [], deterministic: {} },
      playbook: { stages: [] },
      examples: [],
    };

    // 1. Generation A starts and triggers interruption
    await coordinator.streamTurn({
      session,
      turnId: 'turn_A',
      generationId: 'gen_A',
      snapshot,
      callerTranscript: 'pergunta primeira',
      isGenerationActive: (_callId, genId) => callActiveGen === genId,
    });

    // Verify A1 was spoken but late A2 was discarded
    expect(spokenChunks).toContain('A1_delta');
    expect(spokenChunks).not.toContain('A2_late_delta');

    // 2. Generation B starts and completes normally
    await coordinator.streamTurn({
      session,
      turnId: 'turn_B',
      generationId: 'gen_B',
      snapshot,
      callerTranscript: 'pergunta segunda',
      isGenerationActive: (_callId, genId) => callActiveGen === genId,
    });

    expect(spokenChunks).toContain('B1_normal');
    expect(spokenChunks).toContain('B2_normal');

    // 3. Check conversation history: partial A must NOT be committed
    const history = await historyStore.listForCall({
      organizationId: '11111111-1111-1111-1111-111111111111',
      callId: '00000000-0000-0000-0000-000000000001',
    });

    const assistantTurns = history.filter((h) => h.role === 'assistant');
    expect(assistantTurns).toHaveLength(1);
    expect(assistantTurns[0]?.turnId).toBe('turn_B');
    expect(assistantTurns[0]?.content).toContain('B1_normalB2_normal');
  });
});
