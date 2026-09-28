import { describe, expect, it } from 'vitest';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { CallRuntimeNotActiveError } from '@voice-agent/errors';
import {
  ConversationOrchestrator,
  createCallSession,
  FakeConversationModel,
  InMemoryCallSessionStore,
} from '@voice-agent/voice';
import {
  FakeTwilioConversationRelaySimulator,
  TwilioVoiceTransportAdapter,
  TwilioWebSocketBoundary,
} from './index.js';

describe('Twilio ConversationRelay Event Ordering & Idempotency', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';
  const callId = '00000000-0000-0000-0000-000000000001';

  const snapshot: AgentConfigurationSnapshotV1 = {
    persona: {
      role: 'Atendente',
      companyName: 'Telecom',
      objective: 'Ajuda',
      tone: 'OBJECTIVE',
      greetingPhrase: 'Olá',
      closingPhrase: 'Tchau',
      fallbackPhrase: 'Repita',
    },
    voice: { languageCode: 'pt-BR' },
    rules: { conversational: [], deterministic: {} },
    playbook: { stages: [] },
    examples: [],
  };

  async function createSetup() {
    const store = new InMemoryCallSessionStore();
    const transport = new TwilioVoiceTransportAdapter();
    const model = new FakeConversationModel();
    const orchestrator = new ConversationOrchestrator(store, transport, model);
    const session = createCallSession({
      callId,
      organizationId: orgId,
      agentId: '22222222-2222-2222-2222-222222222222',
      agentVersionId: '33333333-3333-3333-3333-333333333333',
    });
    await store.save(session);

    const simulator = new FakeTwilioConversationRelaySimulator();
    const boundary = new TwilioWebSocketBoundary(
      { organizationId: orgId, callId, agentSnapshot: snapshot },
      { orchestrator, transportAdapter: transport, socketSender: simulator },
    );
    simulator.attachBoundary(boundary);

    return { store, orchestrator, transport, simulator, boundary };
  }

  it('rejects prompt before setup (CREATED state) without corrupting session', async () => {
    const { store, simulator } = await createSetup();

    await expect(simulator.simulatePrompt('Alô?')).rejects.toThrow(CallRuntimeNotActiveError);

    const session = await store.getById(orgId, callId);
    expect(session?.runtimeState).toBe('CREATED');
    expect(session?.currentTurnId).toBeNull();
  });

  it('handles duplicate disconnect safely and idempotently', async () => {
    const { store, simulator } = await createSetup();
    await simulator.simulateSetup();

    const active = await store.getById(orgId, callId);
    expect(active?.runtimeState).toBe('ACTIVE');

    // First disconnect transitions to ENDED
    await simulator.simulateDisconnect('user_hung_up');
    const ended = await store.getById(orgId, callId);
    expect(ended?.runtimeState).toBe('ENDED');

    // Second disconnect does not throw and preserves ENDED
    await simulator.simulateDisconnect('duplicate_hangup');
    const stillEnded = await store.getById(orgId, callId);
    expect(stillEnded?.runtimeState).toBe('ENDED');
  });

  it('ignores disconnect received after terminal state without mutating session', async () => {
    const { store, simulator } = await createSetup();

    // Session transitions to FAILED from error
    await simulator.simulateError(500, 'Carrier fatal failure');
    const failed = await store.getById(orgId, callId);
    expect(failed?.runtimeState).toBe('FAILED');

    // Disconnect after terminal state is ignored
    await simulator.simulateDisconnect('late_disconnect');
    const stillFailed = await store.getById(orgId, callId);
    expect(stillFailed?.runtimeState).toBe('FAILED');
  });
});
