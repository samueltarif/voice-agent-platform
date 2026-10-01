import { describe, expect, it, vi } from 'vitest';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { createNullLogger, type Logger } from '@voice-agent/logger';
import {
  createStagingSyntheticShadowComposition,
  DEFAULT_AUXILIARY_FEATURE_MODE,
  STAGING_SHADOW_MAX_CONCURRENCY,
  STAGING_SHADOW_TIMEOUT_MS,
  TimedAuxiliaryTurnDecisionPort,
} from './composition-root.staging-shadow.js';
import { ConversationOrchestrator } from './conversation-orchestrator.js';
import { createCallSession } from './create-call-session.js';
import { FakeConversationModel } from './fake-conversation-model.js';
import { FakeVoiceTransport } from './fake-voice-transport.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';

function createMockTypeSafeResponse(
  answers = {
    is_deterministic_candidate: { noul: 0.34 },
    is_generative_required: { noul: 0.32 },
    is_security_escalation: { noul: 0.02 },
  },
): Response {
  return new Response(
    JSON.stringify({
      model: 'jev-1.13.0',
      answers,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

const testOrgId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const testCallId = '11111111-1111-1111-1111-111111111111';
const testAgentId = '22222222-2222-2222-2222-222222222222';
const testAgentVersionId = '33333333-3333-3333-3333-333333333333';

const mockSnapshot: AgentConfigurationSnapshotV1 = {
  persona: {
    role: 'Atendente',
    companyName: 'Empresa Teste',
    objective: 'Atendimento sintético',
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

async function setupActiveSession(
  orchestrator: ConversationOrchestrator,
  store: InMemoryCallSessionStore,
  callId = testCallId,
): Promise<void> {
  const session = createCallSession({
    callId,
    organizationId: testOrgId,
    agentId: testAgentId,
    agentVersionId: testAgentVersionId,
  });
  await store.save(session);
  await orchestrator.handleEvent({
    type: 'transport.connected',
    callId,
    organizationId: testOrgId,
    timestamp: new Date(),
  });
}

describe('TypeSafe Staging Synthetic Shadow Composition Root', () => {
  it('1. default DISABLED: TypeSafe adapter is not called and turns are dropped', () => {
    const fetchFn = vi.fn();
    const composition = createStagingSyntheticShadowComposition({
      environment: 'staging',
      apiKey: 'test-api-key',
      fetchFn,
    });

    expect(composition.effectiveMode).toBe(DEFAULT_AUXILIARY_FEATURE_MODE);
    expect(composition.effectiveMode).toBe('DISABLED');

    const result = composition.observer.observeTurn({
      organizationId: 'org_test',
      callId: 'call_1',
      turnId: 'turn_1',
      callerTranscript: 'Olá',
    });

    expect(result.status).toBe('DROPPED_DISABLED');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('2. production environment: staging TypeSafe SHADOW composition is strictly unavailable', () => {
    expect(() =>
      createStagingSyntheticShadowComposition({
        environment: 'production' as 'staging',
        apiKey: 'test-api-key',
      }),
    ).toThrow('TypeSafe SHADOW composition is strictly unavailable in production');

    expect(() =>
      createStagingSyntheticShadowComposition({
        environment: 'custom' as 'staging',
        apiKey: 'test-api-key',
      }),
    ).toThrow("Unsupported environment for staging synthetic composition: 'custom'");
  });

  it('3. staging synthetic composition: adapter and observer are constructed with explicit caps', () => {
    const composition = createStagingSyntheticShadowComposition({
      environment: 'staging',
      mode: 'SHADOW',
      apiKey: 'test-api-key',
    });

    expect(composition.effectiveMode).toBe('SHADOW');
    expect(composition.maxConcurrency).toBe(STAGING_SHADOW_MAX_CONCURRENCY);
    expect(composition.maxConcurrency).toBe(1);
    expect(composition.timeoutMs).toBe(STAGING_SHADOW_TIMEOUT_MS);
    expect(composition.timeoutMs).toBe(1500);
    expect(composition.port.providerName).toBe('typesafe-jev');
  });

  it('4. concurrency cap = 1: concurrent turn is dropped without backlog or queuing', async () => {
    let resolveFirstFetch!: (res: Response) => void;
    const fetchFn = vi.fn().mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirstFetch = resolve;
        }),
    );

    const composition = createStagingSyntheticShadowComposition({
      environment: 'staging',
      mode: 'SHADOW',
      apiKey: 'test-api-key',
      fetchFn,
    });

    const turn1 = composition.observer.observeTurn({
      organizationId: 'org_test',
      callId: 'call_1',
      turnId: 'turn_1',
      callerTranscript: 'Primeiro turno',
    });
    expect(turn1.status).toBe('ACCEPTED');
    expect(composition.observer.activeCount).toBe(1);

    const turn2 = composition.observer.observeTurn({
      organizationId: 'org_test',
      callId: 'call_1',
      turnId: 'turn_2',
      callerTranscript: 'Segundo turno concorrente',
    });
    expect(turn2.status).toBe('DROPPED_CAPACITY');
    expect(composition.observer.activeCount).toBe(1);

    resolveFirstFetch(createMockTypeSafeResponse());
    await composition.observer.waitForAll();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(composition.observer.activeCount).toBe(0);
  });

  it('5. timeout = 1500ms: auxiliary evaluation is aborted upon timeout', async () => {
    const innerPort = {
      providerName: 'mock-port',
      evaluateTurn: vi.fn().mockImplementation(
        (
          _input,
          signal?: { aborted: boolean; addEventListener?: (event: string, fn: () => void) => void },
        ) =>
          new Promise<never>((_, reject) => {
            if (signal) {
              signal.addEventListener?.('abort', () => {
                reject(new Error('Inner request aborted by signal'));
              });
            }
          }),
      ),
    };

    const timedPort = new TimedAuxiliaryTurnDecisionPort(innerPort, 30);

    await expect(
      timedPort.evaluateTurn({
        organizationId: 'org_test',
        callId: 'call_1',
        turnId: 'turn_1',
        callerTranscript: 'Timeout test',
      }),
    ).rejects.toThrow('TypeSafe auxiliary evaluation timed out after 30ms');
  });

  it('6. timeout does not block main conversation flow in ConversationOrchestrator', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();

    const fetchFn = vi.fn().mockImplementation(
      () =>
        new Promise<never>(() => {
          // Never resolves: simulates severe provider hang
        }),
    );

    const composition = createStagingSyntheticShadowComposition({
      environment: 'staging',
      mode: 'SHADOW',
      apiKey: 'test-api-key',
      timeoutMs: 40,
      fetchFn,
    });

    const orchestrator = new ConversationOrchestrator({
      sessionStore: store,
      transport,
      model,
      shadowObserver: composition.observer,
    });

    await setupActiveSession(orchestrator, store, testCallId);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId: testCallId,
        organizationId: testOrgId,
        turnId: 'turn_1',
        transcript: 'Fala do usuário',
        timestamp: new Date(),
      },
      mockSnapshot,
    );

    expect(model.recordedInputs).toHaveLength(1);
    expect(transport.speakCalls.length).toBeGreaterThan(0);
    const spoken = transport.speakCalls.map((c) => c.command.text).join('');
    expect(spoken).toBe('Olá! Como posso ajudar você hoje?');

    await composition.observer.waitForAll();
  });

  it('7. provider failure does not block main conversation flow', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();

    const fetchFn = vi.fn().mockRejectedValue(new Error('Network connection failure'));

    const composition = createStagingSyntheticShadowComposition({
      environment: 'staging',
      mode: 'SHADOW',
      apiKey: 'test-api-key',
      fetchFn,
    });

    const orchestrator = new ConversationOrchestrator({
      sessionStore: store,
      transport,
      model,
      shadowObserver: composition.observer,
    });

    await setupActiveSession(orchestrator, store, testCallId);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId: testCallId,
        organizationId: testOrgId,
        turnId: 'turn_1',
        transcript: 'Mensagem do usuário',
        timestamp: new Date(),
      },
      mockSnapshot,
    );

    expect(model.recordedInputs).toHaveLength(1);
    const spoken = transport.speakCalls.map((c) => c.command.text).join('');
    expect(spoken).toBe('Olá! Como posso ajudar você hoje?');

    await composition.observer.waitForAll();
  });

  it('8. no retry: exactly one provider request attempted on failure', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

    const composition = createStagingSyntheticShadowComposition({
      environment: 'staging',
      mode: 'SHADOW',
      apiKey: 'test-api-key',
      fetchFn,
    });

    composition.observer.observeTurn({
      organizationId: 'org_test',
      callId: 'call_1',
      turnId: 'turn_1',
      callerTranscript: 'No retry test',
    });

    await composition.observer.waitForAll();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('9. TypeSafe raw scores remain purely advisory and do not alter routing or bypass', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();

    const fetchFn = vi.fn().mockResolvedValue(
      createMockTypeSafeResponse({
        is_deterministic_candidate: { noul: 0.99 },
        is_generative_required: { noul: 0.01 },
        is_security_escalation: { noul: 0.01 },
      }),
    );

    const composition = createStagingSyntheticShadowComposition({
      environment: 'staging',
      mode: 'SHADOW',
      apiKey: 'test-api-key',
      fetchFn,
    });

    const orchestrator = new ConversationOrchestrator({
      sessionStore: store,
      transport,
      model,
      shadowObserver: composition.observer,
    });

    await setupActiveSession(orchestrator, store, testCallId);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId: testCallId,
        organizationId: testOrgId,
        turnId: 'turn_1',
        transcript: 'Quero falar com suporte',
        timestamp: new Date(),
      },
      mockSnapshot,
    );

    await composition.observer.waitForAll();

    expect(model.recordedInputs).toHaveLength(1);
    const spoken = transport.speakCalls.map((c) => c.command.text).join('');
    expect(spoken).toBe('Olá! Como posso ajudar você hoje?');
  });

  it('10. ACTIVE_GUARDED remains blocked and throws on composition attempt', () => {
    expect(() =>
      createStagingSyntheticShadowComposition({
        environment: 'staging',
        mode: 'ACTIVE_GUARDED',
        apiKey: 'test-api-key',
      }),
    ).toThrow('ACTIVE_GUARDED is blocked and unreachable in current runtime foundation');
  });

  it('11. customer transcript is not logged in structured telemetry logs', async () => {
    const loggedMessages: Array<{ message: string; meta?: unknown }> = [];
    const testLogger: Logger = {
      ...createNullLogger(),
      info: (message: string, meta?: unknown) => {
        loggedMessages.push({ message, meta });
      },
      warn: (message: string, meta?: unknown) => {
        loggedMessages.push({ message, meta });
      },
    };

    const sensitivePhrase = 'SECRET_CUSTOMER_TRANSCRIPT_PHRASE';
    const fetchFn = vi.fn().mockResolvedValue(createMockTypeSafeResponse());

    const composition = createStagingSyntheticShadowComposition({
      environment: 'staging',
      mode: 'SHADOW',
      apiKey: 'test-api-key',
      fetchFn,
      logger: testLogger,
    });

    composition.observer.observeTurn({
      organizationId: 'org_test',
      callId: 'call_privacy',
      turnId: 'turn_privacy',
      callerTranscript: sensitivePhrase,
    });

    await composition.observer.waitForAll();

    const loggedPayload = JSON.stringify(loggedMessages);
    expect(loggedPayload).not.toContain(sensitivePhrase);
  });

  it('12. zero real network calls occur across test suite', async () => {
    const fetchFn = vi.fn().mockResolvedValue(createMockTypeSafeResponse());

    const composition = createStagingSyntheticShadowComposition({
      environment: 'staging',
      mode: 'SHADOW',
      apiKey: 'test-api-key',
      fetchFn,
    });

    composition.observer.observeTurn({
      organizationId: 'org_test',
      callId: 'call_isolated',
      turnId: 'turn_isolated',
      callerTranscript: 'Isolation check',
    });

    await composition.observer.waitForAll();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.typesafe.ai/v1/systemone',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
        }),
      }),
    );
  });
});
