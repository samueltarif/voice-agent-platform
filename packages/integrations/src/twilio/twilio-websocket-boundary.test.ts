import { describe, expect, it } from 'vitest';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { InvalidProviderMessageError } from '@voice-agent/errors';
import {
  ConversationOrchestrator,
  createCallSession,
  FakeConversationModel,
  InMemoryCallSessionStore,
} from '@voice-agent/voice';
import { FakeTwilioConversationRelaySimulator } from './fake-twilio-conversation-relay-simulator.js';
import { TwilioVoiceTransportAdapter } from './twilio-voice-transport-adapter.js';
import { TwilioWebSocketBoundary } from './twilio-websocket-boundary.js';

describe('Twilio WebSocket Session Boundary', () => {
  const callId = '00000000-0000-0000-0000-000000000001';
  const orgA = '11111111-1111-1111-1111-111111111111';
  const orgB = '22222222-2222-2222-2222-222222222222';

  const mockSnapshot: AgentConfigurationSnapshotV1 = {
    persona: {
      role: 'Assistente Twilio',
      companyName: 'Acme Telecom',
      objective: 'Atender clientes',
      tone: 'OBJECTIVE',
      greetingPhrase: 'Olá!',
      closingPhrase: 'Tchau!',
      fallbackPhrase: 'Não entendi.',
    },
    voice: { languageCode: 'pt-BR' },
    rules: { conversational: ['Seja claro'], deterministic: {} },
    playbook: { stages: [] },
    examples: [],
  };

  async function createSetup(organizationId = orgA, cId = callId) {
    const store = new InMemoryCallSessionStore();
    const transportAdapter = new TwilioVoiceTransportAdapter();
    const model = new FakeConversationModel();
    const orchestrator = new ConversationOrchestrator(store, transportAdapter, model);

    const session = createCallSession({
      callId: cId,
      organizationId,
      agentId: '33333333-3333-3333-3333-333333333333',
      agentVersionId: '44444444-4444-4444-4444-444444444444',
    });
    await store.save(session);

    const simulator = new FakeTwilioConversationRelaySimulator();
    const boundary = new TwilioWebSocketBoundary(
      { organizationId, callId: cId, agentSnapshot: mockSnapshot },
      {
        orchestrator,
        transportAdapter,
        socketSender: simulator,
      },
    );
    simulator.attachBoundary(boundary);

    return { store, transportAdapter, model, orchestrator, simulator, boundary };
  }

  it('Happy Path: translates synthetic connect, speech and streams tokens to Twilio simulator', async () => {
    const { store, model, simulator } = await createSetup();
    model.responseChunks = ['Olá! ', 'Como posso ajudar?'];

    await simulator.simulateSetup();
    const sessionAfterConnect = await store.getById(orgA, callId);
    expect(sessionAfterConnect?.runtimeState).toBe('ACTIVE');

    await simulator.simulatePrompt('Gostaria de saber meu saldo.');

    expect(simulator.sentTextTokens).toHaveLength(2);
    expect(simulator.sentTextTokens[0]?.token).toBe('Olá! ');
    expect(simulator.sentTextTokens[0]?.last).toBe(false);
    expect(simulator.sentTextTokens[1]?.token).toBe('Como posso ajudar?');
    expect(simulator.sentTextTokens[1]?.last).toBe(true);

    const sessionAfterPrompt = await store.getById(orgA, callId);
    expect(sessionAfterPrompt?.currentTurnId).toBeDefined();
    expect(sessionAfterPrompt).not.toHaveProperty('sessionId');
    expect(sessionAfterPrompt).not.toHaveProperty('callSid');
  });

  it('Barge-In: drops late model chunks when interruption is simulated mid-stream', async () => {
    const { model, simulator } = await createSetup();
    model.responseChunks = ['Chunk 1. ', 'Chunk 2. ', 'Chunk 3 (stale).'];

    await simulator.simulateSetup();

    model.onChunkYield = async (chunk) => {
      if (chunk.textDelta === 'Chunk 2. ') {
        await simulator.simulateInterrupt('Pára um minuto!');
      }
    };

    await simulator.simulatePrompt('Explique o plano detalhado.');

    expect(simulator.sentTextTokens).toHaveLength(1);
    expect(simulator.sentTextTokens[0]?.token).toBe('Chunk 1. ');
  });

  it('Disconnect: triggers state machine transition and cleanly closes adapter', async () => {
    const { store, simulator } = await createSetup();

    await simulator.simulateSetup();
    const active = await store.getById(orgA, callId);
    expect(active?.runtimeState).toBe('ACTIVE');

    await simulator.simulateDisconnect('user_hung_up');
    const ended = await store.getById(orgA, callId);
    expect(ended?.runtimeState).toBe('ENDED');
    expect(simulator.isClosed).toBe(true);
  });

  it('Disconnect in CONNECTING state transitions to FAILED', async () => {
    const store = new InMemoryCallSessionStore();
    const transportAdapter = new TwilioVoiceTransportAdapter();
    const model = new FakeConversationModel();
    const orchestrator = new ConversationOrchestrator(store, transportAdapter, model);

    const session = createCallSession({
      callId,
      organizationId: orgA,
      agentId: '33333333-3333-3333-3333-333333333333',
      agentVersionId: '44444444-4444-4444-4444-444444444444',
    });
    // Manually set to CONNECTING without active transport
    await store.save({ ...session, runtimeState: 'CONNECTING' });

    const simulator = new FakeTwilioConversationRelaySimulator();
    const boundary = new TwilioWebSocketBoundary(
      { organizationId: orgA, callId, agentSnapshot: mockSnapshot },
      {
        orchestrator,
        transportAdapter,
        socketSender: simulator,
      },
    );
    simulator.attachBoundary(boundary);

    await simulator.simulateDisconnect('carrier_timeout');
    const failedSession = await store.getById(orgA, callId);
    expect(failedSession?.runtimeState).toBe('FAILED');
  });

  it('Malformed payload rejects with InvalidProviderMessageError and does not crash', async () => {
    const { boundary } = await createSetup();

    await expect(boundary.handleIncomingRaw('INVALID_NON_JSON{')).rejects.toThrow(
      InvalidProviderMessageError,
    );
    await expect(boundary.handleIncomingRaw(JSON.stringify({}))).rejects.toThrow(
      InvalidProviderMessageError,
    );
  });

  it('Unknown event safely logs and does not crash or corrupt session', async () => {
    const { store, simulator } = await createSetup();
    await simulator.simulateSetup();

    await simulator.simulateUnknownEvent('custom_unsupported_telephony_event');

    const session = await store.getById(orgA, callId);
    expect(session?.runtimeState).toBe('ACTIVE');
  });

  it('Tenant boundary: Org A boundary cannot mutate Org B CallSession', async () => {
    const sharedCallId = '00000000-0000-0000-0000-000000000099';
    const { store, simulator: simA } = await createSetup(orgA, sharedCallId);
    await createSetup(orgB, sharedCallId);

    await simA.simulateSetup();
    const sessionA = await store.getById(orgA, sharedCallId);
    expect(sessionA?.runtimeState).toBe('ACTIVE');

    const lookupBInOrgAStore = await store.getById(orgB, sharedCallId);
    expect(lookupBInOrgAStore).toBeNull();
  });
});
