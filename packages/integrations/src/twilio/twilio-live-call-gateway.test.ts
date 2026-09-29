import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createVoiceGatewayConfig } from '@voice-agent/config';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import {
  CallBootstrapAlreadyConsumedError,
  InvalidProviderBindingError,
  ProviderAuthenticationError,
} from '@voice-agent/errors';
import {
  CallLifecycleGateway,
  ConversationOrchestrator,
  FakeConversationModel,
  InMemoryCallBootstrapRegistry,
  InMemoryCallSessionStore,
} from '@voice-agent/voice';
import { FakeTwilioConversationRelaySimulator } from './fake-twilio-conversation-relay-simulator.js';
import { resolveTwilioCanonicalUrl } from './twilio-canonical-url-resolver.js';
import { TwilioVoiceTransportAdapter } from './twilio-voice-transport-adapter.js';
import { TwilioWebSocketBoundary } from './twilio-websocket-boundary.js';
import { TwilioWebSocketBootstrapResolver } from './twilio-websocket-bootstrap-resolver.js';

describe('Twilio Live Call Gateway & Simulated E2E Flow', () => {
  const syntheticAuthToken = 'synth_ws_token_123';
  const config = createVoiceGatewayConfig({
    publicVoiceBaseUrl: 'https://voice.example.com',
    conversationRelayPath: '/v1/twilio/conversation-relay',
    bootstrapTtlMs: 60_000,
  });

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

  const testCallInput = {
    organizationId: '00000000-0000-0000-0000-000000000001',
    agentId: '00000000-0000-0000-0000-000000000002',
    agentVersionId: '00000000-0000-0000-0000-000000000003',
    agentSnapshot: mockSnapshot,
    agentVersionStatus: 'PUBLISHED' as const,
  };

  function createSignedHandshake(
    path = '/v1/twilio/conversation-relay',
    query?: Record<string, string>,
    signatureOverride?: string,
  ) {
    const canonicalUrl = resolveTwilioCanonicalUrl({
      publicBaseUrl: config.publicVoiceBaseUrl,
      requestPath: path,
      query,
    });
    const validSignature = createHmac('sha1', syntheticAuthToken)
      .update(canonicalUrl, 'utf8')
      .digest('base64');
    return {
      path,
      headers: { 'x-twilio-signature': signatureOverride ?? validSignature },
      query,
    };
  }

  beforeEach(() => {
    registry = new InMemoryCallBootstrapRegistry();
    sessionStore = new InMemoryCallSessionStore();
    gateway = new CallLifecycleGateway({
      bootstrapRegistry: registry,
      sessionStore,
      defaultTtlMs: 60_000,
    });
    resolver = new TwilioWebSocketBootstrapResolver({
      gateway,
      config,
      authToken: syntheticAuthToken,
    });
  });

  it('rejects unauthenticated handshake and leaves bootstrap in PENDING status', async () => {
    const bootstrap = await gateway.prepareCall(testCallInput);

    await expect(
      resolver.resolveBinding({
        handshake: { path: '/v1/twilio/conversation-relay', headers: {} },
        customParameters: { bootstrapId: bootstrap.bootstrapId },
      }),
    ).rejects.toThrow(ProviderAuthenticationError);
    let state = await gateway.getBootstrap(bootstrap.bootstrapId);
    expect(state?.status).toBe('PENDING');

    await expect(
      resolver.resolveBinding({
        handshake: createSignedHandshake('/v1/twilio/conversation-relay', undefined, 'forged-sig'),
        customParameters: { bootstrapId: bootstrap.bootstrapId },
      }),
    ).rejects.toThrow(ProviderAuthenticationError);
    state = await gateway.getBootstrap(bootstrap.bootstrapId);
    expect(state?.status).toBe('PENDING');
  });

  it('resolves binding with valid synthetic signature and rejects double consume', async () => {
    const bootstrap = await gateway.prepareCall(testCallInput);
    const handshake = createSignedHandshake();

    const binding = await resolver.resolveBinding({
      handshake,
      customParameters: { bootstrapId: bootstrap.bootstrapId },
    });
    expect(binding.organizationId).toBe(bootstrap.organizationId);
    expect(binding.callId).toBe(bootstrap.callId);
    expect(binding.agentSnapshot).toEqual(mockSnapshot);

    const consumed = await gateway.getBootstrap(bootstrap.bootstrapId);
    expect(consumed?.status).toBe('CONSUMED');

    await expect(
      resolver.resolveBinding({
        handshake,
        customParameters: { bootstrapId: bootstrap.bootstrapId },
      }),
    ).rejects.toThrow(CallBootstrapAlreadyConsumedError);
  });

  it('rejects binding resolution when bootstrapId is missing or invalid', async () => {
    const handshake = createSignedHandshake();
    await expect(resolver.resolveBinding({ handshake })).rejects.toThrow(
      InvalidProviderBindingError,
    );
    await expect(
      resolver.resolveBinding({
        handshake: createSignedHandshake('/v1/twilio/conversation-relay', {
          bootstrapId: 'not-a-uuid',
        }),
      }),
    ).rejects.toThrow(InvalidProviderBindingError);
  });

  it('executes complete local simulated lifecycle from bootstrap to prompt and disconnect', async () => {
    const bootstrap = await gateway.prepareCall({
      ...testCallInput,
      providerName: 'twilio',
      providerCallId: 'CA_live_sid_999',
    });

    const bindingContext = await resolver.resolveBinding({
      handshake: createSignedHandshake(),
      customParameters: { bootstrapId: bootstrap.bootstrapId },
    });
    expect(bindingContext.callId).toBe(bootstrap.callId);

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

    await simulator.simulateSetup('CA_live_sid_999', 'CR_live_session_999', {
      bootstrapId: bootstrap.bootstrapId,
    });
    const active = await sessionStore.getById(bindingContext.organizationId, bindingContext.callId);
    expect(active?.runtimeState).toBe('ACTIVE');

    await simulator.simulatePrompt('Preciso de informações sobre minha conta.');
    expect(simulator.sentTextTokens.length).toBeGreaterThan(0);
    const fullText = simulator.sentTextTokens.map((m) => m.token).join('');
    expect(fullText).toBe('Olá! Como posso ajudar você hoje?');

    await simulator.simulateDisconnect();
    const ended = await sessionStore.getById(bindingContext.organizationId, bindingContext.callId);
    expect(ended?.runtimeState).toBe('ENDED');
  });
});
