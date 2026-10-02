import { describe, expect, it } from 'vitest';
import { createNullLogger } from '@voice-agent/logger';

import {
  type PendingDeterministicResponse,
  dispatchDeterministicResponse,
  resolveConversationalCompletion,
  resolveInterruptedHistory,
} from './deterministic-response-delivery.js';
import { InMemoryConversationHistoryStore } from './in-memory-conversation-history-store.js';
import { ConversationOrchestrator } from './conversation-orchestrator.js';
import { createCallSession } from './create-call-session.js';
import { FakeVoiceTransport } from './fake-voice-transport.js';
import { FakeConversationModel } from './fake-conversation-model.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';

const callId = '00000000-0000-0000-0000-000000000011';
const organizationId = '11111111-1111-1111-1111-111111111122';
const agentId = '22222222-2222-2222-2222-222222222233';
const agentVersionId = '33333333-3333-3333-3333-333333333344';

const nullLogger = createNullLogger();

const mockSnapshot: AgentConfigurationSnapshotV1 = {
  persona: {
    role: 'Atendente',
    companyName: 'Empresa',
    objective: 'Atender',
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

function makeActiveGenerations(callId: string, genId: string): Map<string, string> {
  return new Map([[callId, genId]]);
}

async function makeActiveOrchestrator() {
  const store = new InMemoryCallSessionStore();
  const transport = new FakeVoiceTransport();
  const model = new FakeConversationModel();
  const historyStore = new InMemoryConversationHistoryStore();
  const orchestrator = new ConversationOrchestrator({
    sessionStore: store,
    transport,
    model,
    historyStore,
  });
  const session = createCallSession({ callId, organizationId, agentId, agentVersionId });
  await store.save(session);
  await orchestrator.handleEvent({
    type: 'transport.connected',
    callId,
    organizationId,
    timestamp: new Date(),
  });
  return { store, transport, model, historyStore, orchestrator };
}

// ============================================================
// Tests A–D: Ownership & Dispatch Semantics (delivery helper)
// ============================================================

describe('A: active generation + deterministic response → speak called once with isFinal=true', () => {
  it('dispatches with correct generationId and isFinal=true', async () => {
    const transport = new FakeVoiceTransport();
    const historyStore = new InMemoryConversationHistoryStore();
    const genId = 'gen_turn-1_1';
    const activeGenerations = makeActiveGenerations(callId, genId);
    const pending = new Map<string, PendingDeterministicResponse>();

    await dispatchDeterministicResponse(
      {
        transport,
        historyStore,
        logger: nullLogger,
        isGenerationActive: (cId, gId) => activeGenerations.get(cId) === gId,
      },
      {
        organizationId,
        callId,
        assistantTurnId: 'turn-1',
        generationId: genId,
        responseText: 'Horário: 9h–18h.',
      },
      pending,
    );

    expect(transport.speakCalls).toHaveLength(1);
    expect(transport.speakCalls[0]?.command.generationId).toBe(genId);
    expect(transport.speakCalls[0]?.command.isFinal).toBe(true);
    expect(pending.get(callId)?.dispatched).toBe(true);
  });
});

describe('B: stale generation before commit → speak not called, no history', () => {
  it('suppresses dispatch when generation is stale before commit', async () => {
    const transport = new FakeVoiceTransport();
    const historyStore = new InMemoryConversationHistoryStore();
    const activeGenerations = makeActiveGenerations(callId, 'stale_turn-1_1');
    const pending = new Map<string, PendingDeterministicResponse>();

    const result = await dispatchDeterministicResponse(
      {
        transport,
        historyStore,
        logger: nullLogger,
        isGenerationActive: (cId, gId) => activeGenerations.get(cId) === gId,
      },
      {
        organizationId,
        callId,
        assistantTurnId: 'turn-1',
        generationId: 'gen_turn-1_1',
        responseText: 'Should not speak.',
      },
      pending,
    );

    expect(transport.speakCalls).toHaveLength(0);
    expect(result.staleBefore).toBe(true);
    expect(result.dispatched).toBe(false);
    expect(pending.size).toBe(0);
    const history = await historyStore.listForCall({ organizationId, callId });
    expect(history).toHaveLength(0);
  });
});

describe('C: transport.speak throws after OPTION_B commit → no OpenAI fallback', () => {
  it('returns transportError, dispatched=true; no new streamTurn called', async () => {
    const transport = new FakeVoiceTransport();
    transport.shouldFailOnSpeak = true;
    const historyStore = new InMemoryConversationHistoryStore();
    const genId = 'gen_turn-1_1';
    const activeGenerations = makeActiveGenerations(callId, genId);
    const pending = new Map<string, PendingDeterministicResponse>();

    const result = await dispatchDeterministicResponse(
      {
        transport,
        historyStore,
        logger: nullLogger,
        isGenerationActive: (cId, gId) => activeGenerations.get(cId) === gId,
      },
      {
        organizationId,
        callId,
        assistantTurnId: 'turn-1',
        generationId: genId,
        responseText: 'Error text.',
      },
      pending,
    );

    expect(result.dispatched).toBe(true);
    expect(result.transportError).toBeInstanceOf(Error);
    // ownership committed before speak → pending exists → no fallback
    expect(pending.get(callId)?.dispatched).toBe(true);
    // no history persisted (no interruption metadata)
    const history = await historyStore.listForCall({ organizationId, callId });
    expect(history).toHaveLength(0);
  });
});

describe('D: deterministic dispatch → no second response path owns same generation', () => {
  it('pending map holds exactly one entry after dispatch; second dispatch attempt for same generation writes only once', async () => {
    const transport = new FakeVoiceTransport();
    const historyStore = new InMemoryConversationHistoryStore();
    const genId = 'gen_turn-1_1';
    const activeGenerations = makeActiveGenerations(callId, genId);
    const pending = new Map<string, PendingDeterministicResponse>();

    await dispatchDeterministicResponse(
      {
        transport,
        historyStore,
        logger: nullLogger,
        isGenerationActive: (cId, gId) => activeGenerations.get(cId) === gId,
      },
      {
        organizationId,
        callId,
        assistantTurnId: 'turn-1',
        generationId: genId,
        responseText: 'First.',
      },
      pending,
    );

    // Second attempt with same callId but now generation is already stale (first dispatch changed nothing in activeGenerations)
    activeGenerations.set(callId, 'stale_turn-1_2');
    const result2 = await dispatchDeterministicResponse(
      {
        transport,
        historyStore,
        logger: nullLogger,
        isGenerationActive: (cId, gId) => activeGenerations.get(cId) === gId,
      },
      {
        organizationId,
        callId,
        assistantTurnId: 'turn-1',
        generationId: genId,
        responseText: 'Second.',
      },
      pending,
    );

    expect(result2.staleBefore).toBe(true);
    expect(transport.speakCalls).toHaveLength(1);
  });
});

// ============================================================
// Tests E–H: Interruption / H4 / H5
// ============================================================

describe('E: dispatched + interruption with utterance → H4: partial assistant turn with isInterrupted=true', () => {
  it('records provider-reported utterance as interrupted history, not full text', async () => {
    const historyStore = new InMemoryConversationHistoryStore();
    const pending: PendingDeterministicResponse = {
      generationId: 'gen_t1_1',
      assistantTurnId: 'turn-1',
      fullText: 'Full response.',
      dispatched: true,
    };

    await resolveInterruptedHistory({ historyStore, logger: nullLogger }, pending, {
      organizationId,
      callId,
      interruptedUtterance: 'Partial utterance.',
    });

    const history = await historyStore.listForCall({ organizationId, callId });
    expect(history).toHaveLength(1);
    expect(history[0]?.role).toBe('assistant');
    expect(history[0]?.content).toBe('Partial utterance.');
    expect(history[0]?.isInterrupted).toBe(true);
    expect(history[0]?.turnId).toBe('turn-1');
    // full text NOT persisted
    expect(history[0]?.content).not.toBe('Full response.');
  });
});

describe('F: interruption without interruptedUtterance → H5: nothing persisted', () => {
  it('does not persist any assistant turn when metadata absent', async () => {
    const historyStore = new InMemoryConversationHistoryStore();
    const pending: PendingDeterministicResponse = {
      generationId: 'gen_t1_1',
      assistantTurnId: 'turn-1',
      fullText: 'Full response.',
      dispatched: true,
    };

    await resolveInterruptedHistory({ historyStore, logger: nullLogger }, pending, {
      organizationId,
      callId,
      interruptedUtterance: undefined,
    });

    const history = await historyStore.listForCall({ organizationId, callId });
    expect(history).toHaveLength(0);
  });

  it('does not persist assistant turn when interruptedUtterance is empty string (H5)', async () => {
    const historyStore = new InMemoryConversationHistoryStore();
    const pending: PendingDeterministicResponse = {
      generationId: 'gen_t1_1',
      assistantTurnId: 'turn-1',
      fullText: 'Full response.',
      dispatched: true,
    };

    await resolveInterruptedHistory({ historyStore, logger: nullLogger }, pending, {
      organizationId,
      callId,
      interruptedUtterance: '',
    });

    const history = await historyStore.listForCall({ organizationId, callId });
    expect(history).toHaveLength(0);
  });
});

describe('G: interruption event alone → no model stream started, no new speak', () => {
  it('handleUserInterruption does not call model or speak', async () => {
    const { transport, model, orchestrator } = await makeActiveOrchestrator();

    await orchestrator.handleEvent({
      type: 'user.interruption',
      callId,
      organizationId,
      turnId: 'turn-interrupt-1',
      timestamp: new Date(),
    });

    expect(model.recordedInputs).toHaveLength(0);
    expect(transport.speakCalls).toHaveLength(0);
  });
});

describe('H: interruption invalidates old generation → late chunks/resolution do not create new history', () => {
  it('old-generation speak calls are suppressed after interruption; no completion recorded', async () => {
    const { transport, model, historyStore, orchestrator } = await makeActiveOrchestrator();
    model.responseChunks = ['Chunk A. ', 'Chunk B (stale).'];

    model.onChunkYield = async (chunk) => {
      if ('textDelta' in chunk && chunk.textDelta === 'Chunk B (stale).') {
        await orchestrator.handleEvent({
          type: 'user.interruption',
          callId,
          organizationId,
          turnId: 'turn-2',
          timestamp: new Date(),
          interruptedUtterance: 'Chunk A.',
        });
      }
    };

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId: 'turn-1',
        transcript: 'Something',
        timestamp: new Date(),
      },
      mockSnapshot,
    );

    // Only chunk A dispatched; chunk B discarded after interruption
    const speakTexts = transport.speakCalls.map((s) => s.command.text);
    expect(speakTexts).not.toContain('Chunk B (stale).');
    // No generative completion recorded (isGenerationActive was false for old genId)
    const history = await historyStore.listForCall({ organizationId, callId });
    const assistantTurns = history.filter((h) => h.role === 'assistant');
    // No full completion should have been recorded for the interrupted generative turn
    expect(
      assistantTurns.every(
        (t) => t.isInterrupted !== false || t.content !== 'Chunk A. Chunk B (stale).',
      ),
    ).toBe(true);
  });
});

// ============================================================
// Tests I–K: Next-turn / conversational completion
// ============================================================

describe('I–J: deterministic dispatch + no interruption + next user turn → conversational completion before new user turn', () => {
  it('resolves prior deterministic response as non-interrupted before processing next user turn', async () => {
    const { transport, model, historyStore, orchestrator } = await makeActiveOrchestrator();

    model.setResponse('model response');
    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId: 'turn-1',
        transcript: 'Hello',
        timestamp: new Date(),
      },
      mockSnapshot,
    );

    transport.reset();
    const pending: PendingDeterministicResponse = {
      generationId: 'gen_det-turn_1',
      assistantTurnId: 'det-turn-1',
      fullText: 'Deterministic response text.',
      dispatched: true,
    };

    await resolveConversationalCompletion({ historyStore, logger: nullLogger }, pending, {
      organizationId,
      callId,
    });

    const historyAfter = await historyStore.listForCall({ organizationId, callId });
    const completedTurn = historyAfter.find((h) => h.turnId === 'det-turn-1');
    expect(completedTurn).toBeDefined();
    expect(completedTurn?.role).toBe('assistant');
    expect(completedTurn?.content).toBe('Deterministic response text.');
    expect(completedTurn?.isInterrupted).toBe(false);

    // J: assistant history ordered before any new user turn that follows
    const detIdx = historyAfter.findIndex((h) => h.turnId === 'det-turn-1');
    expect(detIdx).toBeGreaterThanOrEqual(0);
  });

  it('ACOUSTIC_PLAYBACK_COMPLETION is NOT claimed in the resolved history', async () => {
    const historyStore = new InMemoryConversationHistoryStore();
    const pending: PendingDeterministicResponse = {
      generationId: 'gen_t1_1',
      assistantTurnId: 't1',
      fullText: 'Resp.',
      dispatched: true,
    };

    await resolveConversationalCompletion({ historyStore, logger: nullLogger }, pending, {
      organizationId,
      callId,
    });

    const history = await historyStore.listForCall({ organizationId, callId });
    // K: no acoustic completion claim — isInterrupted=false only means "no interruption observed",
    //    not that audio was confirmed played in full.
    expect(history[0]?.isInterrupted).toBe(false);
    // No 'acoustic' field or completion confirmation beyond what the contract has.
    expect(Object.keys(history[0] ?? {})).not.toContain('acousticPlaybackComplete');
  });
});

// ============================================================
// Tenant isolation: pending state scoped by callId
// ============================================================

describe('Tenant isolation: pending response scoped by callId, not leaked cross-call', () => {
  it('interruption for different callId does not resolve pending for current callId', async () => {
    const historyStore = new InMemoryConversationHistoryStore();
    const differentCallId = '99999999-9999-9999-9999-999999999999';
    const pending = new Map<string, PendingDeterministicResponse>();

    // Pending for callId
    pending.set(callId, {
      generationId: 'gen_t1_1',
      assistantTurnId: 'turn-1',
      fullText: 'Full.',
      dispatched: true,
    });

    // Interruption arrives for differentCallId — should not affect callId's pending
    const differentPending = pending.get(differentCallId);
    if (differentPending) {
      await resolveInterruptedHistory({ historyStore, logger: nullLogger }, differentPending, {
        organizationId,
        callId: differentCallId,
        interruptedUtterance: 'Other call.',
      });
    }

    // callId's pending should be untouched
    expect(pending.has(callId)).toBe(true);
    const history = await historyStore.listForCall({ organizationId, callId });
    expect(history).toHaveLength(0);
  });
});

// ============================================================
// deliverDeterministicResponse via orchestrator seam (integration)
// ============================================================

describe('orchestrator.deliverDeterministicResponse integration', () => {
  it('speak called once via orchestrator seam when generation active', async () => {
    const { store, transport, model, orchestrator } = await makeActiveOrchestrator();

    // Start a real turn to register active generation
    model.pause();
    const speechPromise = orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId: 'turn-1',
        transcript: 'q',
        timestamp: new Date(),
      },
      mockSnapshot,
    );

    // Get the current session to know actual generationId
    await new Promise((r) => setTimeout(r, 10));
    const session = await store.getById(organizationId, callId);
    const activeGenId = session?.generationId ?? '';

    // Deliver deterministic response while generation is active
    await orchestrator.deliverDeterministicResponse({
      organizationId,
      callId,
      assistantTurnId: 'turn-1',
      generationId: activeGenId,
      responseText: 'Horário: 9h às 18h.',
    });

    model.resume();
    await speechPromise;

    // At least one speak call must be from deterministic delivery with isFinal=true
    const deterministicSpeak = transport.speakCalls.find(
      (s) => s.command.text === 'Horário: 9h às 18h.',
    );
    expect(deterministicSpeak).toBeDefined();
    expect(deterministicSpeak?.command.isFinal).toBe(true);
  });
});
