import { describe, expect, it } from 'vitest';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { ConversationOrchestrator } from './conversation-orchestrator.js';
import { createCallSession } from './create-call-session.js';
import { FakeConversationModel } from './fake-conversation-model.js';
import { FakeVoiceTransport } from './fake-voice-transport.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';

describe('Turn Model & Barge-In Semantics', () => {
  const callId = '00000000-0000-0000-0000-000000000001';
  const organizationId = '11111111-1111-1111-1111-111111111111';

  const mockSnapshot: AgentConfigurationSnapshotV1 = {
    persona: {
      role: 'Atendente Virtual',
      companyName: 'Voz Corp',
      objective: 'Ajudar clientes',
      tone: 'OBJECTIVE',
      greetingPhrase: 'Olá!',
      closingPhrase: 'Até logo!',
      fallbackPhrase: 'Poderia repetir?',
    },
    voice: { languageCode: 'pt-BR' },
    rules: { conversational: ['Seja cordial'], deterministic: {} },
    playbook: { stages: [] },
    examples: [],
  };

  it('generates speech chunks for active generation without interruption', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    model.responseChunks = ['Primeira parte. ', 'Segunda parte.'];

    const orchestrator = new ConversationOrchestrator(store, transport, model);
    const session = createCallSession({
      callId,
      organizationId,
      agentId: '22222222-2222-2222-2222-222222222222',
      agentVersionId: '33333333-3333-3333-3333-333333333333',
    });
    await store.save(session);

    await orchestrator.handleEvent({
      type: 'transport.connected',
      callId,
      organizationId,
      timestamp: new Date(),
    });

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId: 'turn-1',
        transcript: 'Quero saber mais sobre os planos.',
        timestamp: new Date(),
      },
      mockSnapshot,
    );

    expect(transport.speakCalls).toHaveLength(2);
    expect(transport.speakCalls[0]?.command.text).toBe('Primeira parte. ');
    expect(transport.speakCalls[0]?.command.isFinal).toBe(false);
    expect(transport.speakCalls[1]?.command.text).toBe('Segunda parte.');
    expect(transport.speakCalls[1]?.command.isFinal).toBe(true);

    const updatedSession = await store.getById(organizationId, callId);
    expect(updatedSession?.currentTurnId).toBe('turn-1');
    expect(updatedSession?.generationId).toMatch(/^gen_turn-1_\d+$/);
  });

  it('discards late stale chunks when user interruption occurs mid-stream (barge-in)', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    model.responseChunks = ['Chunk 1. ', 'Chunk 2. ', 'Chunk 3 (stale).'];

    const orchestrator = new ConversationOrchestrator(store, transport, model);
    const session = createCallSession({
      callId,
      organizationId,
      agentId: '22222222-2222-2222-2222-222222222222',
      agentVersionId: '33333333-3333-3333-3333-333333333333',
    });
    await store.save(session);

    await orchestrator.handleEvent({
      type: 'transport.connected',
      callId,
      organizationId,
      timestamp: new Date(),
    });

    // Intercept yield of chunk 2 to trigger user interruption (barge-in) after chunk 1
    model.onChunkYield = async (chunk) => {
      if (chunk.textDelta === 'Chunk 2. ') {
        await orchestrator.handleEvent({
          type: 'user.interruption',
          callId,
          organizationId,
          turnId: 'turn-2',
          timestamp: new Date(),
        });
      }
    };

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId: 'turn-1',
        transcript: 'Explique tudo em detalhes.',
        timestamp: new Date(),
      },
      mockSnapshot,
    );

    // Only chunk 1 was sent before interruption occurred; chunk 2 and 3 must be discarded
    expect(transport.speakCalls).toHaveLength(1);
    expect(transport.speakCalls[0]?.command.text).toBe('Chunk 1. ');

    // Transport interruptSpeech was emitted
    expect(transport.interruptCalls).toHaveLength(1);
    expect(transport.interruptCalls[0]?.callId).toBe(callId);

    // Generation was marked as stale
    const sessionAfterInterruption = await store.getById(organizationId, callId);
    expect(sessionAfterInterruption?.generationId).toMatch(/^stale_turn-2_\d+$/);
  });

  it('accepts subsequent turn after barge-in with new generationId', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();

    const orchestrator = new ConversationOrchestrator(store, transport, model);
    const session = createCallSession({
      callId,
      organizationId,
      agentId: '22222222-2222-2222-2222-222222222222',
      agentVersionId: '33333333-3333-3333-3333-333333333333',
    });
    await store.save(session);

    await orchestrator.handleEvent({
      type: 'transport.connected',
      callId,
      organizationId,
      timestamp: new Date(),
    });

    // Turn 1 interrupted
    await orchestrator.handleEvent({
      type: 'user.interruption',
      callId,
      organizationId,
      turnId: 'turn-1-interrupt',
      timestamp: new Date(),
    });

    transport.reset();
    model.setResponse('Entendido, como posso ajudar agora?');

    // Turn 2 executed normally
    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId: 'turn-2',
        transcript: 'Na verdade quero falar com suporte.',
        timestamp: new Date(),
      },
      mockSnapshot,
    );

    expect(transport.speakCalls).toHaveLength(1);
    expect(transport.speakCalls[0]?.command.text).toBe('Entendido, como posso ajudar agora?');
    expect(transport.speakCalls[0]?.command.generationId).toMatch(/^gen_turn-2_\d+$/);
  });
});
