import { describe, expect, it } from 'vitest';
import type {
  AgentConfigurationSnapshotV1,
  AuxiliaryTurnDecisionInput,
  AuxiliaryTurnDecisionOutput,
  AuxiliaryTurnDecisionPort,
} from '@voice-agent/contracts';
import { AuxiliaryTurnShadowObserver } from './auxiliary-turn-shadow-observer.js';
import { ConversationOrchestrator } from './conversation-orchestrator.js';
import { createCallSession } from './create-call-session.js';
import { DeterministicResponseDeliveryCoordinator } from './deterministic-response-delivery-coordinator.js';
import { FakeConversationModel } from './fake-conversation-model.js';
import { FakeVoiceTransport } from './fake-voice-transport.js';
import { GuardedTurnRoutingCoordinator } from './guarded-turn-routing-coordinator.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';
import { InMemoryConversationHistoryStore } from './in-memory-conversation-history-store.js';
import { createNullLogger } from '@voice-agent/logger';
import { CANONICAL_SECURITY_BLOCKED_RESPONSE } from './security-blocked-response.js';

class FakeDeterministicAuxiliaryPort implements AuxiliaryTurnDecisionPort {
  readonly providerName = 'fake-deterministic-auxiliary';
  public callCount = 0;
  public evaluatedInputs: AuxiliaryTurnDecisionInput[] = [];
  public output: AuxiliaryTurnDecisionOutput = {
    deterministicScore: 0.9,
    generativeScore: 0.1,
    securityScore: 0.01,
    providerModel: 'fake-jev-v1',
    latencyMs: 10,
  };
  public shouldThrow = false;
  public throwError: Error = new Error('Auxiliary evaluation failed');
  public delayMs = 0;

  private startedResolver?: () => void;
  public evaluationStarted = new Promise<void>((resolve) => {
    this.startedResolver = resolve;
  });

  resetStartedPromise(): void {
    this.evaluationStarted = new Promise<void>((resolve) => {
      this.startedResolver = resolve;
    });
  }

  async evaluateTurn(
    input: AuxiliaryTurnDecisionInput,
    signal?: AbortSignal,
  ): Promise<AuxiliaryTurnDecisionOutput> {
    this.callCount++;
    this.evaluatedInputs.push(input);
    this.startedResolver?.();
    if (this.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.delayMs);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Aborted'));
        });
      });
    }
    if (this.shouldThrow) {
      throw this.throwError;
    }
    return this.output;
  }
}

describe('Guarded Runtime Routing Integration — OFFLINE', () => {
  const organizationId = '11111111-1111-1111-1111-111111111111';
  const callId = '22222222-2222-2222-2222-222222222222';
  const turnId = 'turn-001';

  const baseSnapshot: AgentConfigurationSnapshotV1 = {
    persona: {
      role: 'Atendente',
      companyName: 'Empresa Teste',
      objective: 'Atender clientes',
      tone: 'OBJECTIVE',
      greetingPhrase: 'Olá!',
      closingPhrase: 'Até logo!',
      fallbackPhrase: 'Não compreendi',
    },
    voice: { languageCode: 'pt-BR' },
    rules: {
      conversational: [],
      deterministic: {
        operatingHours: 'Segunda a Sexta das 08h às 18h',
      },
    },
    playbook: { stages: [] },
    examples: [],
  };

  function setupOrchestrator(options?: {
    auxiliaryPort?: FakeDeterministicAuxiliaryPort;
    shadowObserver?: AuxiliaryTurnShadowObserver;
  }) {
    const sessionStore = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    const historyStore = new InMemoryConversationHistoryStore();
    const auxiliaryPort = options?.auxiliaryPort ?? new FakeDeterministicAuxiliaryPort();

    const orchestrator = new ConversationOrchestrator({
      sessionStore,
      transport,
      model,
      historyStore,
      shadowObserver: options?.shadowObserver,
      guardedRoutingPort: auxiliaryPort,
    });

    return {
      sessionStore,
      transport,
      model,
      historyStore,
      auxiliaryPort,
      orchestrator,
    };
  }

  async function createActiveCall(sessionStore: InMemoryCallSessionStore) {
    const session = {
      ...createCallSession({
        callId,
        organizationId,
        agentId: '33333333-3333-3333-3333-333333333333',
        agentVersionId: '44444444-4444-4444-4444-444444444444',
      }),
      runtimeState: 'ACTIVE' as const,
    };
    await sessionStore.save(session);
    return session;
  }

  // 1. matcher false -> Jev 0 -> OpenAI fake 1
  it('1. matcher false -> Jev calls = 0 -> OpenAI streamTurn called exactly once', async () => {
    const { sessionStore, transport, model, auxiliaryPort, orchestrator } = setupOrchestrator();
    await createActiveCall(sessionStore);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId,
        transcript: 'Gostaria de agendar uma consulta para amanhã',
        timestamp: new Date(),
      },
      baseSnapshot,
    );

    // Jev port was NOT evaluated (Matcher-First privacy invariant)
    expect(auxiliaryPort.callCount).toBe(0);
    // Generative model was called exactly once
    expect(model.recordedInputs.length).toBe(1);
    expect(
      model.recordedInputs[0]?.messages.some(
        (m) => m.content === 'Gostaria de agendar uma consulta para amanhã',
      ),
    ).toBe(true);
    // Spoken output came from generative model
    expect(transport.speakCalls.length).toBeGreaterThan(0);
  });

  // 2. matcher true + Jev DETERMINISTIC_CANDIDATE + handler handled -> Jev 1 -> deterministic speak 1 -> OpenAI 0
  it('2. matcher true + DETERMINISTIC_CANDIDATE + handled -> Jev 1 -> deterministic speak 1 -> OpenAI 0', async () => {
    const auxiliaryPort = new FakeDeterministicAuxiliaryPort();
    auxiliaryPort.output = {
      deterministicScore: 0.88,
      generativeScore: 0.12,
      securityScore: 0.02,
      providerModel: 'fake-jev-v1',
      latencyMs: 15,
    };

    const { sessionStore, transport, model, orchestrator } = setupOrchestrator({ auxiliaryPort });
    await createActiveCall(sessionStore);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId,
        transcript: 'Qual o horário de atendimento?',
        timestamp: new Date(),
      },
      baseSnapshot,
    );

    expect(auxiliaryPort.callCount).toBe(1);
    expect(auxiliaryPort.evaluatedInputs[0]).toEqual({
      organizationId,
      callId,
      turnId,
      callerTranscript: 'Qual o horário de atendimento?',
    });

    // OpenAI model was NOT called
    expect(model.recordedInputs.length).toBe(0);

    // Deterministic response was spoken
    expect(transport.speakCalls.length).toBe(1);
    expect(transport.speakCalls[0]?.command.text).toContain(
      'Nosso horário de atendimento é: Segunda a Sexta das 08h às 18h.',
    );
  });

  // 3. matcher true + SECURITY_ESCALATE -> Jev 1 -> static security speak 1 -> OpenAI 0 -> call ACTIVE
  it('3. matcher true + SECURITY_ESCALATE -> Jev 1 -> static security speak 1 -> OpenAI 0 -> call remains ACTIVE', async () => {
    const auxiliaryPort = new FakeDeterministicAuxiliaryPort();
    auxiliaryPort.output = {
      deterministicScore: 0.1,
      generativeScore: 0.1,
      securityScore: 0.85, // >= 0.56 -> SECURITY_ESCALATE
      providerModel: 'fake-jev-v1',
      latencyMs: 12,
    };

    const { sessionStore, transport, model, orchestrator } = setupOrchestrator({ auxiliaryPort });
    await createActiveCall(sessionStore);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId,
        transcript: 'Qual o horário de funcionamento de vocês?',
        timestamp: new Date(),
      },
      baseSnapshot,
    );

    expect(auxiliaryPort.callCount).toBe(1);
    // OpenAI model calls = 0
    expect(model.recordedInputs.length).toBe(0);

    // Canonical security response was delivered
    expect(transport.speakCalls.length).toBe(1);
    expect(transport.speakCalls[0]?.command.text).toBe(CANONICAL_SECURITY_BLOCKED_RESPONSE);

    // Call remains ACTIVE
    const session = await sessionStore.getById(organizationId, callId);
    expect(session?.runtimeState).toBe('ACTIVE');
  });

  // 4. matcher true + GENERATIVE_REQUIRED -> Jev 1 -> OpenAI 1 -> deterministic/security speak 0
  it('4. matcher true + GENERATIVE_REQUIRED -> Jev 1 -> OpenAI 1 -> deterministic/security speak 0', async () => {
    const auxiliaryPort = new FakeDeterministicAuxiliaryPort();
    auxiliaryPort.output = {
      deterministicScore: 0.2, // < 0.35 -> GENERATIVE_REQUIRED
      generativeScore: 0.8,
      securityScore: 0.05,
      providerModel: 'fake-jev-v1',
      latencyMs: 14,
    };

    const { sessionStore, transport, model, orchestrator } = setupOrchestrator({ auxiliaryPort });
    await createActiveCall(sessionStore);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId,
        transcript: 'Qual o horário de atendimento?',
        timestamp: new Date(),
      },
      baseSnapshot,
    );

    expect(auxiliaryPort.callCount).toBe(1);
    // OpenAI model called exactly once
    expect(model.recordedInputs.length).toBe(1);
    // Spoken sentences came from model stream, not static templates
    expect(transport.speakCalls.length).toBeGreaterThan(0);
    const texts = transport.speakCalls.map((c) => c.command.text);
    expect(texts).not.toContain(CANONICAL_SECURITY_BLOCKED_RESPONSE);
  });

  // 5. Jev throws -> OpenAI 1 -> deterministic bypass 0 -> security response 0
  it('5. Jev throws -> fail-open to main model (OpenAI 1) -> deterministic bypass 0 -> security response 0', async () => {
    const auxiliaryPort = new FakeDeterministicAuxiliaryPort();
    auxiliaryPort.shouldThrow = true;
    auxiliaryPort.throwError = new Error('TypeSafe network timeout');

    const { sessionStore, transport, model, orchestrator } = setupOrchestrator({ auxiliaryPort });
    await createActiveCall(sessionStore);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId,
        transcript: 'Qual o horário de atendimento?',
        timestamp: new Date(),
      },
      baseSnapshot,
    );

    expect(auxiliaryPort.callCount).toBe(1);
    // Fail-open to main model: OpenAI stream called
    expect(model.recordedInputs.length).toBe(1);
    // Deterministic bypass = prohibited (0 deterministic sentences)
    const texts = transport.speakCalls.map((c) => c.command.text);
    expect(texts.some((t) => t.includes('Segunda a Sexta'))).toBe(false);
    // Security response = 0
    expect(texts).not.toContain(CANONICAL_SECURITY_BLOCKED_RESPONSE);

    // Call remains ACTIVE
    const session = await sessionStore.getById(organizationId, callId);
    expect(session?.runtimeState).toBe('ACTIVE');
  });

  // 6. handler handled=false -> OpenAI 1 -> deterministic speak 0
  it('6. handler handled=false -> fallback to generative (OpenAI 1) -> deterministic speak 0', async () => {
    const auxiliaryPort = new FakeDeterministicAuxiliaryPort();
    auxiliaryPort.output = {
      deterministicScore: 0.9,
      generativeScore: 0.1,
      securityScore: 0.01,
      providerModel: 'fake-jev-v1',
      latencyMs: 10,
    };

    // Snapshot with empty operatingHours
    const snapshotWithoutHours: AgentConfigurationSnapshotV1 = {
      ...baseSnapshot,
      rules: {
        conversational: [],
        deterministic: {
          operatingHours: '   ', // whitespace only -> handled: false
        },
      },
    };

    const { sessionStore, transport, model, orchestrator } = setupOrchestrator({ auxiliaryPort });
    await createActiveCall(sessionStore);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId,
        transcript: 'Qual o horário de atendimento?',
        timestamp: new Date(),
      },
      snapshotWithoutHours,
    );

    expect(auxiliaryPort.callCount).toBe(1);
    // Handler handled=false -> fall back to OpenAI model
    expect(model.recordedInputs.length).toBe(1);
    // Deterministic response was NOT spoken
    const texts = transport.speakCalls.map((c) => c.command.text);
    expect(texts.some((t) => t.includes('Segunda a Sexta'))).toBe(false);
  });

  // 7. tenant mismatch -> deterministic speak 0
  it('7. tenant mismatch -> handled=false -> deterministic speak 0 -> fallback to generative', async () => {
    const auxiliaryPort = new FakeDeterministicAuxiliaryPort();
    auxiliaryPort.output = {
      deterministicScore: 0.9,
      generativeScore: 0.1,
      securityScore: 0.01,
      providerModel: 'fake-jev-v1',
      latencyMs: 10,
    };

    const { sessionStore, transport, model, orchestrator } = setupOrchestrator({ auxiliaryPort });
    await createActiveCall(sessionStore);

    // Pass mismatched configurationOrganizationId
    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId,
        transcript: 'Qual o horário de atendimento?',
        timestamp: new Date(),
      },
      baseSnapshot,
      'different-tenant-99999999-9999-9999-9999-999999999999',
    );

    expect(auxiliaryPort.callCount).toBe(1);
    // Deterministic speak = 0
    const texts = transport.speakCalls.map((c) => c.command.text);
    expect(texts.some((t) => t.includes('Segunda a Sexta'))).toBe(false);
    // Fallback to model
    expect(model.recordedInputs.length).toBe(1);
  });

  // 8. missing operatingHours -> deterministic speak 0
  it('8. missing operatingHours -> handled=false -> deterministic speak 0', async () => {
    const auxiliaryPort = new FakeDeterministicAuxiliaryPort();
    auxiliaryPort.output = {
      deterministicScore: 0.9,
      generativeScore: 0.1,
      securityScore: 0.01,
      providerModel: 'fake-jev-v1',
      latencyMs: 10,
    };

    const snapshotMissingHours: AgentConfigurationSnapshotV1 = {
      ...baseSnapshot,
      rules: {
        conversational: [],
        deterministic: {}, // operatingHours missing
      },
    };

    const { sessionStore, transport, model, orchestrator } = setupOrchestrator({ auxiliaryPort });
    await createActiveCall(sessionStore);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId,
        transcript: 'Qual o horário de atendimento?',
        timestamp: new Date(),
      },
      snapshotMissingHours,
    );

    expect(auxiliaryPort.callCount).toBe(1);
    // Deterministic speak = 0
    const texts = transport.speakCalls.map((c) => c.command.text);
    expect(texts.some((t) => t.includes('Segunda a Sexta'))).toBe(false);
    // Model fallback
    expect(model.recordedInputs.length).toBe(1);
  });

  // 9. generation stale while Jev pending -> all response paths for stale generation = 0
  it('9. generation stale while Jev pending -> all response paths for stale generation = 0', async () => {
    const auxiliaryPort = new FakeDeterministicAuxiliaryPort();
    auxiliaryPort.delayMs = 50; // Jev takes 50ms
    auxiliaryPort.output = {
      deterministicScore: 0.95,
      generativeScore: 0.05,
      securityScore: 0.01,
      providerModel: 'fake-jev-v1',
      latencyMs: 50,
    };

    const { sessionStore, transport, model, orchestrator } = setupOrchestrator({ auxiliaryPort });
    await createActiveCall(sessionStore);

    // Turn 1 starts: matcher true, Jev pending
    const turn1Promise = orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId: 'turn-1',
        transcript: 'Qual o horário de atendimento?',
        timestamp: new Date(),
      },
      baseSnapshot,
    );

    // Wait until Jev evaluation has actually started
    await auxiliaryPort.evaluationStarted;

    // User interrupts before Jev finishes
    await orchestrator.handleEvent({
      type: 'user.interruption',
      callId,
      organizationId,
      turnId: 'turn-1-interrupted',
      timestamp: new Date(),
    });

    // Wait for turn1 to finish
    await turn1Promise;

    // Generation was invalidated by interruption:
    // Stale generation must NOT speak deterministic, NOT speak security, NOT stream OpenAI
    expect(transport.speakCalls.length).toBe(0);
    expect(model.recordedInputs.length).toBe(0);
  });

  // 10. guarded + shadow configured -> exactly one auxiliary evaluation total
  it('10. guarded + shadow configured -> single owner -> exactly one auxiliary evaluation total', async () => {
    const auxiliaryPort = new FakeDeterministicAuxiliaryPort();
    auxiliaryPort.output = {
      deterministicScore: 0.9,
      generativeScore: 0.1,
      securityScore: 0.01,
      providerModel: 'fake-jev-v1',
      latencyMs: 10,
    };

    const shadowObserver = new AuxiliaryTurnShadowObserver({
      port: auxiliaryPort,
      mode: 'SHADOW',
      globalAllowedMode: 'SHADOW',
    });

    const { sessionStore, orchestrator } = setupOrchestrator({
      auxiliaryPort,
      shadowObserver,
    });
    await createActiveCall(sessionStore);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId,
        transcript: 'Qual o horário de atendimento?',
        timestamp: new Date(),
      },
      baseSnapshot,
    );

    await shadowObserver.waitForAll();

    // Guarded routing coordinator owns the turn; shadow observer was suppressed.
    // Total auxiliary evaluations = exactly 1 (no duplicate Jev call)
    expect(auxiliaryPort.callCount).toBe(1);
  });

  // 11. guarded absent + shadow present -> shadow behavior preserved
  it('11. guarded absent + shadow present -> shadow observer operates normally', async () => {
    const auxiliaryPort = new FakeDeterministicAuxiliaryPort();
    const shadowObserver = new AuxiliaryTurnShadowObserver({
      port: auxiliaryPort,
      mode: 'SHADOW',
      globalAllowedMode: 'SHADOW',
    });

    const sessionStore = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();

    // Guarded coordinator is undefined (nominal staging shadow setup)
    const orchestrator = new ConversationOrchestrator({
      sessionStore,
      transport,
      model,
      shadowObserver,
    });

    await createActiveCall(sessionStore);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId,
        transcript: 'Gostaria de saber informações gerais',
        timestamp: new Date(),
      },
      baseSnapshot,
    );

    await shadowObserver.waitForAll();

    // Shadow observer ran as expected
    expect(auxiliaryPort.callCount).toBe(1);
    expect(model.recordedInputs.length).toBe(1);
  });

  // 12. SECURITY_ESCALATE: does not mutate to terminal, next user.speech.final processed normally
  it('12. SECURITY_ESCALATE does not mutate call to terminal, next user speech processed normally', async () => {
    const auxiliaryPort = new FakeDeterministicAuxiliaryPort();
    // First turn: security escalate
    auxiliaryPort.output = {
      deterministicScore: 0.1,
      generativeScore: 0.1,
      securityScore: 0.9,
      providerModel: 'fake-jev-v1',
      latencyMs: 10,
    };

    const { sessionStore, transport, model, orchestrator } = setupOrchestrator({ auxiliaryPort });
    await createActiveCall(sessionStore);

    // Turn 1: Security prompt
    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId: 'turn-sec-1',
        transcript: 'Qual o horário de atendimento?',
        timestamp: new Date(),
      },
      baseSnapshot,
    );

    expect(transport.speakCalls.length).toBe(1);
    expect(transport.speakCalls[0]?.command.text).toBe(CANONICAL_SECURITY_BLOCKED_RESPONSE);
    expect(model.recordedInputs.length).toBe(0);

    const sessionAfterSec = await sessionStore.getById(organizationId, callId);
    expect(sessionAfterSec?.runtimeState).toBe('ACTIVE');

    // Turn 2: Normal prompt with deterministic response
    auxiliaryPort.output = {
      deterministicScore: 0.92,
      generativeScore: 0.08,
      securityScore: 0.01,
      providerModel: 'fake-jev-v1',
      latencyMs: 10,
    };

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId: 'turn-norm-2',
        transcript: 'Qual o horário de atendimento?',
        timestamp: new Date(),
      },
      baseSnapshot,
    );

    expect(transport.speakCalls.length).toBe(2);
    expect(transport.speakCalls[1]?.command.text).toContain('Nosso horário de atendimento é:');

    // Still ACTIVE
    const sessionAfterNorm = await sessionStore.getById(organizationId, callId);
    expect(sessionAfterNorm?.runtimeState).toBe('ACTIVE');
  });

  // Direct Unit Tests for GuardedTurnRoutingCoordinator
  describe('GuardedTurnRoutingCoordinator Direct Unit Tests', () => {
    it('returns GENERATIVE when matcher returns false without calling port', async () => {
      const port = new FakeDeterministicAuxiliaryPort();
      const transport = new FakeVoiceTransport();
      const historyStore = new InMemoryConversationHistoryStore();
      const deliveryCoordinator = new DeterministicResponseDeliveryCoordinator({
        transport,
        historyStore,
        logger: createNullLogger(),
        isGenerationActive: () => true,
      });

      const coordinator = new GuardedTurnRoutingCoordinator({
        port,
        deliveryCoordinator,
        isGenerationActive: () => true,
      });

      const session = createCallSession({
        callId,
        organizationId,
        agentId: '33333333-3333-3333-3333-333333333333',
        agentVersionId: '44444444-4444-4444-4444-444444444444',
      });

      const result = await coordinator.routeTurn({
        session,
        turnId: 'turn-001',
        generationId: 'gen-001',
        callerTranscript: 'Quero falar de outro assunto',
        snapshot: baseSnapshot,
      });

      expect(result.outcome).toBe('GENERATIVE');
      expect(port.callCount).toBe(0);
    });

    it('returns STALE when isGenerationActive returns false before Jev evaluation', async () => {
      const port = new FakeDeterministicAuxiliaryPort();
      const transport = new FakeVoiceTransport();
      const historyStore = new InMemoryConversationHistoryStore();
      const deliveryCoordinator = new DeterministicResponseDeliveryCoordinator({
        transport,
        historyStore,
        logger: createNullLogger(),
        isGenerationActive: () => false,
      });

      const coordinator = new GuardedTurnRoutingCoordinator({
        port,
        deliveryCoordinator,
        isGenerationActive: () => false,
      });

      const session = createCallSession({
        callId,
        organizationId,
        agentId: '33333333-3333-3333-3333-333333333333',
        agentVersionId: '44444444-4444-4444-4444-444444444444',
      });

      const result = await coordinator.routeTurn({
        session,
        turnId: 'turn-001',
        generationId: 'gen-001',
        callerTranscript: 'Qual o horário de atendimento?',
        snapshot: baseSnapshot,
      });

      expect(result.outcome).toBe('STALE');
      expect(port.callCount).toBe(0);
    });
  });
});
