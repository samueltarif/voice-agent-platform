import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { ConversationModelError } from '@voice-agent/errors';
import { createNullLogger, type Logger } from '@voice-agent/logger';
import { AssistantStreamCoordinator } from './assistant-stream-coordinator.js';
import { createCallSession } from './create-call-session.js';
import { FakeConversationModel } from './fake-conversation-model.js';
import { FakeVoiceTransport } from './fake-voice-transport.js';
import { InMemoryConversationHistoryStore } from './in-memory-conversation-history-store.js';

describe('Provider-Neutral Conversation Model Test Harness', () => {
  let transport: FakeVoiceTransport;
  let model: FakeConversationModel;
  let historyStore: InMemoryConversationHistoryStore;
  let coordinator: AssistantStreamCoordinator;

  const orgId = '00000000-0000-0000-0000-000000000001';
  const callId = '11111111-1111-1111-1111-111111111111';

  const mockSnapshot: AgentConfigurationSnapshotV1 = {
    persona: {
      role: 'Atendente',
      companyName: 'Empresa Teste',
      objective: 'Atender clientes com rapidez',
      tone: 'OBJECTIVE',
      greetingPhrase: 'Olá!',
      closingPhrase: 'Tchau!',
      fallbackPhrase: 'Poderia repetir?',
    },
    voice: { languageCode: 'pt-BR' },
    rules: { conversational: ['Seja conciso'], deterministic: {} },
    playbook: { stages: [] },
    examples: [],
  };

  const session = createCallSession({
    callId,
    organizationId: orgId,
    agentId: '00000000-0000-0000-0000-000000000002',
    agentVersionId: '00000000-0000-0000-0000-000000000003',
    agentVersionStatus: 'PUBLISHED',
  });

  beforeEach(() => {
    transport = new FakeVoiceTransport();
    model = new FakeConversationModel();
    historyStore = new InMemoryConversationHistoryStore();
    coordinator = new AssistantStreamCoordinator({
      transport,
      model,
      logger: createNullLogger(),
      historyStore,
    });
  });

  it('preserves chronological stream order across text deltas', async () => {
    model.emitStructuredEvents = true;
    model.responseChunks = ['Primeira parte. ', 'Segunda parte. ', 'Conclusão.'];

    await coordinator.appendUserUtterance(session, 'turn-1', 'Pergunta do usuário');
    await coordinator.streamTurn({
      session,
      turnId: 'turn-1',
      generationId: 'gen-1',
      snapshot: mockSnapshot,
      callerTranscript: 'Pergunta do usuário',
      isGenerationActive: () => true,
    });

    expect(transport.speakCalls).toHaveLength(3);
    expect(transport.speakCalls[0]?.command.text).toBe('Primeira parte. ');
    expect(transport.speakCalls[1]?.command.text).toBe('Segunda parte. ');
    expect(transport.speakCalls[2]?.command.text).toBe('Conclusão.');
    expect(transport.speakCalls[2]?.command.isFinal).toBe(true);

    const history = await historyStore.listForCall({ organizationId: orgId, callId });
    expect(history).toHaveLength(2);
    expect(history[0]?.role).toBe('user');
    expect(history[1]?.role).toBe('assistant');
    expect(history[1]?.content).toBe('Primeira parte. Segunda parte. Conclusão.');
  });

  it('terminates stream fail-closed upon model failure without leaking raw internals', async () => {
    model.shouldFail = true;
    model.failureMessage = 'Provider upstream connection reset';

    await expect(
      coordinator.streamTurn({
        session,
        turnId: 'turn-fail',
        generationId: 'gen-fail',
        snapshot: mockSnapshot,
        callerTranscript: 'Pergunta',
        isGenerationActive: () => true,
      }),
    ).rejects.toThrow(ConversationModelError);

    expect(transport.speakCalls).toHaveLength(0);
    const history = await historyStore.listForCall({ organizationId: orgId, callId });
    // Assistant response was not completed so it is not saved
    const assistantTurns = history.filter((h) => h.role === 'assistant');
    expect(assistantTurns).toHaveLength(0);
  });

  it('respects cancellation mid-stream and discards delayed chunks', async () => {
    model.responseChunks = ['Parte 1. ', 'Parte 2. ', 'Parte 3.'];
    let active = true;

    model.onChunkYield = () => {
      // simulate caller barge-in during chunk yield
      active = false;
    };

    await coordinator.streamTurn({
      session,
      turnId: 'turn-interrupted',
      generationId: 'gen-interrupted',
      snapshot: mockSnapshot,
      callerTranscript: 'Fala do usuário',
      isGenerationActive: () => active,
    });

    // Only the first chunk was sent before active became false; subsequent are discarded
    expect(transport.speakCalls.length).toBeLessThan(3);

    // Cancelled assistant response is NOT saved as accepted history
    const history = await historyStore.listForCall({ organizationId: orgId, callId });
    const assistantTurns = history.filter((h) => h.role === 'assistant');
    expect(assistantTurns).toHaveLength(0);
  });

  it('records safe turn observability metadata without logging conversation text', async () => {
    const loggedEvents: Array<{ event: string; meta: Record<string, unknown> }> = [];
    const mockLogger: Logger = {
      ...createNullLogger(),
      info: (msg, meta) => {
        loggedEvents.push({ event: msg, meta: (meta ?? {}) as Record<string, unknown> });
      },
    };

    const monitoredCoordinator = new AssistantStreamCoordinator({
      transport,
      model,
      logger: mockLogger,
      historyStore,
    });

    await monitoredCoordinator.streamTurn({
      session,
      turnId: 'turn-obs',
      generationId: 'gen-obs',
      snapshot: mockSnapshot,
      callerTranscript: 'Texto privado do usuário',
      isGenerationActive: () => true,
    });

    const eventNames = loggedEvents.map((e) => e.event);
    expect(eventNames).toContain('call.turn.started');
    expect(eventNames).toContain('model.stream.first_chunk');
    expect(eventNames).toContain('call.turn.completed');

    // Confirm that no log metadata contains the speech transcript or prompt text
    for (const { meta } of loggedEvents) {
      const metaString = JSON.stringify(meta);
      expect(metaString).not.toContain('Texto privado do usuário');
      expect(metaString).not.toContain('Atender clientes com rapidez');
    }
  });

  it('does not allow model output strings to mutate lifecycle, tenant or agent version', async () => {
    model.responseChunks = [
      'end_call',
      ' {"action": "transfer", "tenant": "00000000-9999-9999-9999-999999999999"}',
    ];

    await coordinator.streamTurn({
      session,
      turnId: 'turn-mimic',
      generationId: 'gen-mimic',
      snapshot: mockSnapshot,
      callerTranscript: 'Encerrar chamada',
      isGenerationActive: () => true,
    });

    expect(session.runtimeState).toBe('CREATED');
    expect(session.organizationId).toBe(orgId);
    expect(session.agentId).toBe('00000000-0000-0000-0000-000000000002');
    expect(session.agentVersionId).toBe('00000000-0000-0000-0000-000000000003');
    expect(transport.endCalls).toHaveLength(0);
  });

  it('enforces terminal stream semantics: discards deltas after completed event and usage does not revive', async () => {
    // Custom stream simulation with post-completed delta and usage
    const customModel = {
      providerName: 'custom-stream-model',
      async streamTurn() {
        return (async function* () {
          yield {
            type: 'text.delta' as const,
            textDelta: 'Válido. ',
            turnId: 't-term',
            generationId: 'g-term',
            isFinal: false,
          };
          yield {
            type: 'completed' as const,
            turnId: 't-term',
            generationId: 'g-term',
            fullText: 'Válido. ',
          };
          yield {
            type: 'text.delta' as const,
            textDelta: 'Inválido após completed.',
            turnId: 't-term',
            generationId: 'g-term',
          };
          yield {
            type: 'usage' as const,
            turnId: 't-term',
            generationId: 'g-term',
            inputTokens: 10,
            outputTokens: 5,
          };
        })();
      },
    };

    const terminalCoordinator = new AssistantStreamCoordinator({
      transport,
      model: customModel,
      logger: createNullLogger(),
      historyStore,
    });

    await terminalCoordinator.streamTurn({
      session,
      turnId: 't-term',
      generationId: 'g-term',
      snapshot: mockSnapshot,
      callerTranscript: 'Teste terminal',
      isGenerationActive: () => true,
    });

    expect(transport.speakCalls).toHaveLength(1);
    expect(transport.speakCalls[0]?.command.text).toBe('Válido. ');
    const history = await historyStore.listForCall({ organizationId: orgId, callId });
    const assistantTurn = history.find((h) => h.role === 'assistant');
    expect(assistantTurn?.content).toBe('Válido. ');
  });

  it('interrupted partial response does not enter memory and next turn uses clean history', async () => {
    // Turn 1: Interrupted mid-stream
    model.responseChunks = ['Início da resposta... ', 'segunda parte atrasada'];
    let active = true;
    model.onChunkYield = () => {
      active = false; // barge-in simulated on first chunk
    };

    await coordinator.appendUserUtterance(session, 'turn-1', 'Pergunta 1');
    await coordinator.streamTurn({
      session,
      turnId: 'turn-1',
      generationId: 'gen-1',
      snapshot: mockSnapshot,
      callerTranscript: 'Pergunta 1',
      isGenerationActive: () => active,
    });

    const historyAfterTurn1 = await historyStore.listForCall({ organizationId: orgId, callId });
    expect(historyAfterTurn1).toHaveLength(1);
    expect(historyAfterTurn1[0]?.role).toBe('user');
    expect(historyAfterTurn1[0]?.content).toBe('Pergunta 1');

    // Turn 2: New user turn completes successfully
    model.onChunkYield = undefined;
    model.responseChunks = ['Resposta completa ao segundo turno.'];
    await coordinator.appendUserUtterance(session, 'turn-2', 'Pergunta 2');
    await coordinator.streamTurn({
      session,
      turnId: 'turn-2',
      generationId: 'gen-2',
      snapshot: mockSnapshot,
      callerTranscript: 'Pergunta 2',
      isGenerationActive: () => true,
    });

    const historyAfterTurn2 = await historyStore.listForCall({ organizationId: orgId, callId });
    expect(historyAfterTurn2).toHaveLength(3);
    expect(historyAfterTurn2[0]?.role).toBe('user');
    expect(historyAfterTurn2[0]?.content).toBe('Pergunta 1');
    expect(historyAfterTurn2[1]?.role).toBe('user');
    expect(historyAfterTurn2[1]?.content).toBe('Pergunta 2');
    expect(historyAfterTurn2[2]?.role).toBe('assistant');
    expect(historyAfterTurn2[2]?.content).toBe('Resposta completa ao segundo turno.');
  });
});
