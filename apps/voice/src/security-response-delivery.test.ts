import { describe, expect, it } from 'vitest';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { ConversationOrchestrator } from './conversation-orchestrator.js';
import { createCallSession } from './create-call-session.js';
import {
  type PendingDeterministicResponse,
  dispatchDeterministicResponse,
} from './deterministic-response-delivery.js';
import { FakeConversationModel } from './fake-conversation-model.js';
import { FakeVoiceTransport } from './fake-voice-transport.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';
import { InMemoryConversationHistoryStore } from './in-memory-conversation-history-store.js';
import { createSecurityBlockedResult } from './security-blocked-action.js';
import {
  CANONICAL_SECURITY_BLOCKED_RESPONSE,
  resolveSecurityBlockedDeliveryInput,
} from './security-blocked-response.js';

const callId = '00000000-0000-0000-0000-000000000011';
const organizationId = '11111111-1111-1111-1111-111111111122';
const agentId = '22222222-2222-2222-2222-222222222233';
const agentVersionId = '33333333-3333-3333-3333-333333333344';

const nullLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

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

describe('Security Response Delivery Offline (Slice C)', () => {
  // ============================================================
  // Tests A–G: Basic Delivery Semantics
  // ============================================================
  describe('A–G: Active generation + explicit SECURITY_BLOCKED delivery', () => {
    it('dispatches canonical static safe response once with isFinal=true, no model/endCall, session stays ACTIVE', async () => {
      const { store, transport, model, orchestrator } = await makeActiveOrchestrator();
      const activeGenId = 'gen_sec_1';
      orchestrator.setActiveGenerationForTest(callId, activeGenId);

      await orchestrator.deliverSecurityBlockedResponse({
        organizationId,
        callId,
        assistantTurnId: 'turn-sec-1',
        generationId: activeGenId,
        securityResult: createSecurityBlockedResult(),
      });

      // A: Speak called for security response exactly once
      expect(transport.speakCalls).toHaveLength(1);

      // B: Text sent matches canonical static safe response
      expect(transport.speakCalls[0]?.command.text).toBe(CANONICAL_SECURITY_BLOCKED_RESPONSE);

      // C: isFinal is true
      expect(transport.speakCalls[0]?.command.isFinal).toBe(true);

      // D: same generationId preserved
      expect(transport.speakCalls[0]?.command.generationId).toBe(activeGenId);

      // E: model/OpenAI calls = 0
      expect(model.recordedInputs).toHaveLength(0);

      // F: transport.endCall calls = 0
      expect(transport.endCalls).toHaveLength(0);

      // G: session runtimeState remains ACTIVE
      const sessionAfter = await store.getById(organizationId, callId);
      expect(sessionAfter?.runtimeState).toBe('ACTIVE');
    });
  });

  // ============================================================
  // Tests H–J: Stale Generation & Ownership Commit
  // ============================================================
  describe('H–J: Stale generation & ownership commit under transport failure', () => {
    it('H: suppresses dispatch when generation is stale before dispatch', async () => {
      const { transport, orchestrator } = await makeActiveOrchestrator();
      orchestrator.setActiveGenerationForTest(callId, 'current_active_gen');

      // Generation 'stale_gen_99' does not match active generation
      await orchestrator.deliverSecurityBlockedResponse({
        organizationId,
        callId,
        assistantTurnId: 'turn-stale',
        generationId: 'stale_gen_99',
      });

      expect(transport.speakCalls).toHaveLength(0);
    });

    it('I: ownership committed immediately before dispatch attempt (OPTION_B)', async () => {
      const transport = new FakeVoiceTransport();
      const historyStore = new InMemoryConversationHistoryStore();
      const genId = 'gen_opt_b';
      const pending = new Map<string, PendingDeterministicResponse>();

      const input = resolveSecurityBlockedDeliveryInput({
        organizationId,
        callId,
        assistantTurnId: 'turn-opt-b',
        generationId: genId,
      });

      await dispatchDeterministicResponse(
        {
          transport,
          historyStore,
          logger: nullLogger,
          isGenerationActive: (cId, gId) => cId === callId && gId === genId,
        },
        input,
        pending,
      );

      const pendingEntry = pending.get(callId);
      expect(pendingEntry).toBeDefined();
      expect(pendingEntry?.dispatched).toBe(true);
      expect(pendingEntry?.fullText).toBe(CANONICAL_SECURITY_BLOCKED_RESPONSE);
      expect(pendingEntry?.generationId).toBe(genId);
    });

    it('J: transport.speak throws after ownership -> no OpenAI fallback, endCall=0, full history=0, session stays ACTIVE', async () => {
      const { store, transport, model, historyStore, orchestrator } =
        await makeActiveOrchestrator();
      transport.shouldFailOnSpeak = true;
      const activeGenId = 'gen_fail_1';
      orchestrator.setActiveGenerationForTest(callId, activeGenId);

      // Deliver security response - transport will throw
      await orchestrator.deliverSecurityBlockedResponse({
        organizationId,
        callId,
        assistantTurnId: 'turn-fail-1',
        generationId: activeGenId,
      });

      // J: model calls = 0 (no OpenAI fallback)
      expect(model.recordedInputs).toHaveLength(0);

      // J: endCall=0, session stays ACTIVE
      expect(transport.endCalls).toHaveLength(0);
      const sessionAfter = await store.getById(organizationId, callId);
      expect(sessionAfter?.runtimeState).toBe('ACTIVE');

      // J: full security response is NOT persisted to history on failure
      const history = await historyStore.listForCall({ organizationId, callId });
      const completedSecTurns = history.filter(
        (h) => h.role === 'assistant' && h.content === CANONICAL_SECURITY_BLOCKED_RESPONSE,
      );
      expect(completedSecTurns).toHaveLength(0);
    });
  });

  // ============================================================
  // Tests K–M: Interruption (H4/H5) & Interruption Alone
  // ============================================================
  describe('K–M: Interruption during security response (H4/H5)', () => {
    it('K: user interruption with interruptedUtterance -> H4 partial assistant turn, full text NOT persisted', async () => {
      const { historyStore, orchestrator } = await makeActiveOrchestrator();
      const genId = 'gen_k_1';
      orchestrator.setActiveGenerationForTest(callId, genId);

      // Deliver security response
      await orchestrator.deliverSecurityBlockedResponse({
        organizationId,
        callId,
        assistantTurnId: 'turn-k-1',
        generationId: genId,
      });

      // User interrupts with partial speech reported
      await orchestrator.handleEvent({
        type: 'user.interruption',
        callId,
        organizationId,
        turnId: 'turn-k-1',
        interruptedUtterance: 'Não consigo...',
        timestamp: new Date(),
      });

      const history = await historyStore.listForCall({ organizationId, callId });
      const interruptedTurn = history.find(
        (h) => h.turnId === 'turn-k-1' && h.role === 'assistant',
      );
      expect(interruptedTurn).toBeDefined();
      expect(interruptedTurn?.content).toBe('Não consigo...');
      expect(interruptedTurn?.isInterrupted).toBe(true);
      // Full security text must NOT be persisted as heard
      expect(interruptedTurn?.content).not.toBe(CANONICAL_SECURITY_BLOCKED_RESPONSE);
    });

    it('L: interruption without interruptedUtterance -> H5: no fabricated partial, full text NOT persisted', async () => {
      const { historyStore, orchestrator } = await makeActiveOrchestrator();
      const genId = 'gen_l_1';
      orchestrator.setActiveGenerationForTest(callId, genId);

      await orchestrator.deliverSecurityBlockedResponse({
        organizationId,
        callId,
        assistantTurnId: 'turn-l-1',
        generationId: genId,
      });

      // User interrupts without utterance metadata
      await orchestrator.handleEvent({
        type: 'user.interruption',
        callId,
        organizationId,
        turnId: 'turn-l-1',
        timestamp: new Date(),
      });

      const history = await historyStore.listForCall({ organizationId, callId });
      const assistantTurns = history.filter((h) => h.role === 'assistant');
      expect(assistantTurns).toHaveLength(0);
    });

    it('M: interruption event alone does not start model or dispatch new response', async () => {
      const { transport, model, orchestrator } = await makeActiveOrchestrator();

      await orchestrator.handleEvent({
        type: 'user.interruption',
        callId,
        organizationId,
        turnId: 'turn-m-1',
        timestamp: new Date(),
      });

      expect(model.recordedInputs).toHaveLength(0);
      expect(transport.speakCalls).toHaveLength(0);
    });
  });

  // ============================================================
  // Tests N–O: Next Turn Continuity (Turn-Scoped Security)
  // ============================================================
  describe('N–O: Turn-scoped security refusal -> call remains ACTIVE -> next turn proceeds', () => {
    it('N: security response completed conversationally -> next user speech proceeds normally', async () => {
      const { store, transport, model, historyStore, orchestrator } =
        await makeActiveOrchestrator();

      // Turn 1: Deliver security response offline
      const gen1 = 'gen_turn_1';
      orchestrator.setActiveGenerationForTest(callId, gen1);

      await orchestrator.deliverSecurityBlockedResponse({
        organizationId,
        callId,
        assistantTurnId: 'turn-1',
        generationId: gen1,
      });

      // Turn 2: Next user.speech.final arrives
      model.setResponse('Nosso horário é de segunda a sexta, das 8h às 18h.');
      await orchestrator.handleEvent(
        {
          type: 'user.speech.final',
          callId,
          organizationId,
          turnId: 'turn-2',
          transcript: 'Qual é o horário de funcionamento?',
          timestamp: new Date(),
        },
        mockSnapshot,
      );

      // Verify Turn 1 was resolved as conversational completion before Turn 2
      const history = await historyStore.listForCall({ organizationId, callId });
      const secTurn = history.find((h) => h.turnId === 'turn-1' && h.role === 'assistant');
      expect(secTurn).toBeDefined();
      expect(secTurn?.content).toBe(CANONICAL_SECURITY_BLOCKED_RESPONSE);
      expect(secTurn?.isInterrupted).toBe(false);

      // Verify Turn 2 proceeded normally through model
      const normalTurn = history.find((h) => h.turnId === 'turn-2' && h.role === 'assistant');
      expect(normalTurn).toBeDefined();
      expect(normalTurn?.content).toBe('Nosso horário é de segunda a sexta, das 8h às 18h.');

      // Session remains ACTIVE throughout
      const sessionAfter = await store.getById(organizationId, callId);
      expect(sessionAfter?.runtimeState).toBe('ACTIVE');
      expect(transport.endCalls).toHaveLength(0);
    });

    it('O: security response interrupted -> next legitimate user turn proceeds normally', async () => {
      const { store, transport, model, historyStore, orchestrator } =
        await makeActiveOrchestrator();

      // Turn 1: Deliver security response offline
      const gen1 = 'gen_turn_sec_o';
      orchestrator.setActiveGenerationForTest(callId, gen1);

      await orchestrator.deliverSecurityBlockedResponse({
        organizationId,
        callId,
        assistantTurnId: 'turn-sec-o',
        generationId: gen1,
      });

      // User interrupts security response
      await orchestrator.handleEvent({
        type: 'user.interruption',
        callId,
        organizationId,
        turnId: 'turn-sec-o',
        interruptedUtterance: 'Não consigo...',
        timestamp: new Date(),
      });

      // Turn 2: Legitimate request arrives
      model.setResponse('Posso sim te transferir para o setor de suporte.');
      await orchestrator.handleEvent(
        {
          type: 'user.speech.final',
          callId,
          organizationId,
          turnId: 'turn-legit-2',
          transcript: 'Pode me ajudar com uma dúvida técnica?',
          timestamp: new Date(),
        },
        mockSnapshot,
      );

      const history = await historyStore.listForCall({ organizationId, callId });
      // Turn 1: interrupted assistant turn
      const turn1 = history.find((h) => h.turnId === 'turn-sec-o' && h.role === 'assistant');
      expect(turn1?.isInterrupted).toBe(true);
      expect(turn1?.content).toBe('Não consigo...');

      // Turn 2: normal completion
      const turn2 = history.find((h) => h.turnId === 'turn-legit-2' && h.role === 'assistant');
      expect(turn2?.content).toBe('Posso sim te transferir para o setor de suporte.');

      const sessionAfter = await store.getById(organizationId, callId);
      expect(sessionAfter?.runtimeState).toBe('ACTIVE');
      expect(transport.endCalls).toHaveLength(0);
    });
  });

  // ============================================================
  // Input Validation Unit Test
  // ============================================================
  describe('resolveSecurityBlockedDeliveryInput', () => {
    it('maps correctly and enforces outcome=SECURITY_BLOCKED', () => {
      const input = {
        organizationId,
        callId,
        assistantTurnId: 't1',
        generationId: 'g1',
      };
      const resolved = resolveSecurityBlockedDeliveryInput(input);
      expect(resolved.organizationId).toBe(organizationId);
      expect(resolved.callId).toBe(callId);
      expect(resolved.assistantTurnId).toBe('t1');
      expect(resolved.generationId).toBe('g1');
      expect(resolved.responseText).toBe(CANONICAL_SECURITY_BLOCKED_RESPONSE);
    });

    it('rejects invalid security result outcome', () => {
      expect(() =>
        resolveSecurityBlockedDeliveryInput({
          organizationId,
          callId,
          assistantTurnId: 't1',
          generationId: 'g1',
          // @ts-expect-error testing runtime check for invalid outcome
          securityResult: { outcome: 'OTHER_OUTCOME' },
        }),
      ).toThrow('Invalid security outcome');
    });
  });
});
