import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import {
  CallBootstrapAlreadyConsumedError,
  InvalidProviderBindingError,
} from '@voice-agent/errors';
import {
  CallLifecycleGateway,
  ConversationOrchestrator,
  FakeConversationModel,
  InMemoryCallBootstrapRegistry,
  InMemoryCallSessionStore,
} from '@voice-agent/voice';
import { FakeTwilioConversationRelaySimulator } from './fake-twilio-conversation-relay-simulator.js';
import { TwilioVoiceTransportAdapter } from './twilio-voice-transport-adapter.js';
import { TwilioWebSocketBoundary } from './twilio-websocket-boundary.js';
import { TwilioWebSocketBootstrapResolver } from './twilio-websocket-bootstrap-resolver.js';

describe('Twilio Live Call Gateway & Simulated E2E Flow', () => {
  let registry: InMemoryCallBootstrapRegistry;
  let sessionStore: InMemoryCallSessionStore;
  let gateway: CallLifecycleGateway;
  let resolver: TwilioWebSocketBootstrapResolver;

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

  beforeEach(() => {
    registry = new InMemoryCallBootstrapRegistry();
    sessionStore = new InMemoryCallSessionStore();
    gateway = new CallLifecycleGateway({
      bootstrapRegistry: registry,
      sessionStore,
      defaultTtlMs: 60_000,
    });
    resolver = new TwilioWebSocketBootstrapResolver(gateway);
  });

  it('resolves binding from customParameters and rejects double consume', async () => {
    const bootstrap = await gateway.prepareCall({
      organizationId: '00000000-0000-0000-0000-000000000001',
      agentId: '00000000-0000-0000-0000-000000000002',
      agentVersionId: '00000000-0000-0000-0000-000000000003',
      agentSnapshot: mockSnapshot,
      agentVersionStatus: 'PUBLISHED',
    });

    const binding = await resolver.resolveBinding({
      customParameters: { bootstrapId: bootstrap.bootstrapId },
    });

    expect(binding.organizationId).toBe(bootstrap.organizationId);
    expect(binding.callId).toBe(bootstrap.callId);
    expect(binding.agentSnapshot).toEqual(mockSnapshot);

    // Second consume attempt via WebSocket fails
    await expect(
      resolver.resolveBinding({
        customParameters: { bootstrapId: bootstrap.bootstrapId },
      }),
    ).rejects.toThrow(CallBootstrapAlreadyConsumedError);
  });

  it('rejects binding resolution when bootstrapId is missing or invalid', async () => {
    await expect(resolver.resolveBinding({})).rejects.toThrow(InvalidProviderBindingError);
    await expect(
      resolver.resolveBinding({ queryParams: { bootstrapId: 'not-a-uuid' } }),
    ).rejects.toThrow(InvalidProviderBindingError);
  });

  it('executes complete local simulated lifecycle from bootstrap to prompt and disconnect', async () => {
    // 1. Prepare call server-side
    const bootstrap = await gateway.prepareCall({
      organizationId: '00000000-0000-0000-0000-000000000001',
      agentId: '00000000-0000-0000-0000-000000000002',
      agentVersionId: '00000000-0000-0000-0000-000000000003',
      agentSnapshot: mockSnapshot,
      agentVersionStatus: 'PUBLISHED',
      providerName: 'twilio',
      providerCallId: 'CA_live_sid_999',
    });

    // 2. Incoming ConversationRelay connection establishes and resolves binding
    const bindingContext = await resolver.resolveBinding({
      customParameters: { bootstrapId: bootstrap.bootstrapId },
    });

    expect(bindingContext.callId).toBe(bootstrap.callId);
    const sessionInStore = await sessionStore.getById(
      bindingContext.organizationId,
      bindingContext.callId,
    );
    expect(sessionInStore?.runtimeState).toBe('CREATED');

    // 3. Set up Orchestrator, Transport, and Simulator
    const simulator = new FakeTwilioConversationRelaySimulator();
    const transportAdapter = new TwilioVoiceTransportAdapter();
    const fakeModel = new FakeConversationModel();
    const orchestrator = new ConversationOrchestrator({
      sessionStore,
      transport: transportAdapter,
      model: fakeModel,
    });

    const boundary = new TwilioWebSocketBoundary(bindingContext, {
      orchestrator,
      transportAdapter,
      socketSender: simulator,
    });
    simulator.attachBoundary(boundary);

    // 4. Twilio sends setup message
    await simulator.simulateSetup('CA_live_sid_999', 'CR_live_session_999', {
      bootstrapId: bootstrap.bootstrapId,
    });

    const activeSession = await sessionStore.getById(
      bindingContext.organizationId,
      bindingContext.callId,
    );
    expect(activeSession?.runtimeState).toBe('ACTIVE');

    // 5. User speaks prompt
    await simulator.simulatePrompt('Preciso de informações sobre minha conta.');

    // Outbound text messages generated by FakeConversationModel and sent through Twilio adapter
    expect(simulator.sentTextTokens.length).toBeGreaterThan(0);
    const fullText = simulator.sentTextTokens.map((m) => m.token).join('');
    expect(fullText).toBe('Olá! Como posso ajudar você hoje?');

    // 6. User disconnects
    await simulator.simulateDisconnect();
    const endedSession = await sessionStore.getById(
      bindingContext.organizationId,
      bindingContext.callId,
    );
    expect(endedSession?.runtimeState).toBe('ENDED');
  });
});
