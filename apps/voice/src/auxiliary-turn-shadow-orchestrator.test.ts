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
import { FakeConversationModel } from './fake-conversation-model.js';
import { FakeVoiceTransport } from './fake-voice-transport.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';

class SlowFakeAuxiliaryPort implements AuxiliaryTurnDecisionPort {
  readonly providerName = 'slow-fake-auxiliary';
  public evaluationStarted = false;
  public evaluationCompleted = false;
  public delayMs = 150;
  public shouldFail = false;

  async evaluateTurn(
    _input: AuxiliaryTurnDecisionInput,
    signal?: AbortSignal,
  ): Promise<AuxiliaryTurnDecisionOutput> {
    this.evaluationStarted = true;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, this.delayMs);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('Evaluation aborted'));
        },
        { once: true },
      );
    });
    if (this.shouldFail) {
      throw new Error('Auxiliary port failure');
    }
    this.evaluationCompleted = true;
    return {
      deterministicScore: 0.95,
      generativeScore: 0.05,
      securityScore: 0.01,
      providerModel: 'slow-fake-v1',
      latencyMs: this.delayMs,
    };
  }
}

describe('ConversationOrchestrator Shadow Observer Integration', () => {
  const callId = '00000000-0000-0000-0000-000000000001';
  const organizationId = '11111111-1111-1111-1111-111111111111';

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

  async function setupActiveSession(
    orchestrator: ConversationOrchestrator,
    store: InMemoryCallSessionStore,
  ): Promise<void> {
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
  }

  it('starts authoritative main model stream without waiting for slow shadow evaluation', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    const auxiliaryPort = new SlowFakeAuxiliaryPort();
    const shadowObserver = new AuxiliaryTurnShadowObserver({
      port: auxiliaryPort,
      mode: 'SHADOW',
      globalAllowedMode: 'SHADOW',
    });

    const orchestrator = new ConversationOrchestrator({
      sessionStore: store,
      transport,
      model,
      shadowObserver,
    });

    await setupActiveSession(orchestrator, store);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId: 'turn-1',
        transcript: 'Olá, gostaria de saber os horários',
        timestamp: new Date(),
      },
      mockSnapshot,
    );

    // Authoritative model was called and stream started immediately
    expect(model.recordedInputs).toHaveLength(1);
    expect(transport.speakCalls.length).toBeGreaterThan(0);

    // Auxiliary port was triggered in background but has not completed yet
    expect(auxiliaryPort.evaluationStarted).toBe(true);
    expect(auxiliaryPort.evaluationCompleted).toBe(false);

    // Await all background shadow promises
    await shadowObserver.waitForAll();
    expect(auxiliaryPort.evaluationCompleted).toBe(true);
  });

  it('completes conversation stream normally even when auxiliary port fails', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    const auxiliaryPort = new SlowFakeAuxiliaryPort();
    auxiliaryPort.delayMs = 10;
    auxiliaryPort.shouldFail = true;

    const shadowObserver = new AuxiliaryTurnShadowObserver({
      port: auxiliaryPort,
      mode: 'SHADOW',
      globalAllowedMode: 'SHADOW',
    });

    const orchestrator = new ConversationOrchestrator({
      sessionStore: store,
      transport,
      model,
      shadowObserver,
    });

    await setupActiveSession(orchestrator, store);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId: 'turn-failed-aux',
        transcript: 'Preciso de ajuda com boleto',
        timestamp: new Date(),
      },
      mockSnapshot,
    );

    await shadowObserver.waitForAll();
    expect(model.recordedInputs).toHaveLength(1);
    expect(transport.speakCalls.length).toBeGreaterThan(0);
  });

  it('aborts shadow evaluation on call disconnect', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    const auxiliaryPort = new SlowFakeAuxiliaryPort();
    auxiliaryPort.delayMs = 200;

    const shadowObserver = new AuxiliaryTurnShadowObserver({
      port: auxiliaryPort,
      mode: 'SHADOW',
      globalAllowedMode: 'SHADOW',
    });

    const orchestrator = new ConversationOrchestrator({
      sessionStore: store,
      transport,
      model,
      shadowObserver,
    });

    await setupActiveSession(orchestrator, store);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId: 'turn-to-abort',
        transcript: 'Tchau',
        timestamp: new Date(),
      },
      mockSnapshot,
    );

    expect(shadowObserver.activeCount).toBe(1);

    await orchestrator.handleEvent({
      type: 'transport.disconnected',
      callId,
      organizationId,
      reason: 'caller_hangup',
      timestamp: new Date(),
    });

    await shadowObserver.waitForAll();
    expect(shadowObserver.activeCount).toBe(0);
    expect(auxiliaryPort.evaluationCompleted).toBe(false);
  });

  it('guarantees no deterministic bypass or business authority is exerted by shadow', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    const auxiliaryPort = new SlowFakeAuxiliaryPort();
    auxiliaryPort.delayMs = 5;

    const shadowObserver = new AuxiliaryTurnShadowObserver({
      port: auxiliaryPort,
      mode: 'SHADOW',
      globalAllowedMode: 'SHADOW',
    });

    const orchestrator = new ConversationOrchestrator({
      sessionStore: store,
      transport,
      model,
      shadowObserver,
    });

    await setupActiveSession(orchestrator, store);

    await orchestrator.handleEvent(
      {
        type: 'user.speech.final',
        callId,
        organizationId,
        turnId: 'turn-check-authority',
        transcript: 'Sim, concordo',
        timestamp: new Date(),
      },
      mockSnapshot,
    );

    await shadowObserver.waitForAll();

    // Verify session state remains ACTIVE, not manipulated or terminated by shadow
    const session = await store.getById(organizationId, callId);
    expect(session?.runtimeState).toBe('ACTIVE');
    expect(session?.organizationId).toBe(organizationId);

    // Verify model was still authoritative and used
    expect(model.recordedInputs).toHaveLength(1);
    expect(transport.speakCalls.length).toBeGreaterThan(0);
  });
});
