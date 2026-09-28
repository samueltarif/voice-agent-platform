import { describe, expect, it } from 'vitest';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import {
  CallRuntimeNotActiveError,
  CallSessionNotFoundError,
  ConversationModelError,
  VoiceTransportError,
} from '@voice-agent/errors';
import { ConversationOrchestrator } from './conversation-orchestrator.js';
import { createCallSession } from './create-call-session.js';
import { FakeConversationModel } from './fake-conversation-model.js';
import { FakeVoiceTransport } from './fake-voice-transport.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';

describe('ConversationOrchestrator Lifecycle & Events', () => {
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

  it('throws CallSessionNotFoundError if session does not exist in store', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    const orchestrator = new ConversationOrchestrator(store, transport, model);

    await expect(
      orchestrator.handleEvent({
        type: 'transport.connected',
        callId: 'non-existent-call',
        organizationId,
        timestamp: new Date(),
      }),
    ).rejects.toThrow(CallSessionNotFoundError);
  });

  it('handles transport.connected by transitioning session to ACTIVE', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    const orchestrator = new ConversationOrchestrator(store, transport, model);

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

    const activeSession = await store.getById(organizationId, callId);
    expect(activeSession?.runtimeState).toBe('ACTIVE');
  });

  it('rejects user speech if session is not ACTIVE', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    const orchestrator = new ConversationOrchestrator(store, transport, model);

    const session = createCallSession({
      callId,
      organizationId,
      agentId: '22222222-2222-2222-2222-222222222222',
      agentVersionId: '33333333-3333-3333-3333-333333333333',
    });
    // Session is still CREATED
    await store.save(session);

    await expect(
      orchestrator.handleEvent(
        {
          type: 'user.speech.final',
          callId,
          organizationId,
          turnId: 'turn-1',
          transcript: 'Olá',
          timestamp: new Date(),
        },
        mockSnapshot,
      ),
    ).rejects.toThrow(CallRuntimeNotActiveError);
  });

  it('rejects user speech when session is in terminal state ENDED', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    const orchestrator = new ConversationOrchestrator(store, transport, model);

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
    await orchestrator.handleEvent({
      type: 'call.end.requested',
      callId,
      organizationId,
      timestamp: new Date(),
    });

    await expect(
      orchestrator.handleEvent(
        {
          type: 'user.speech.final',
          callId,
          organizationId,
          turnId: 'turn-after-ended',
          transcript: 'Ainda está aí?',
          timestamp: new Date(),
        },
        mockSnapshot,
      ),
    ).rejects.toThrow(CallRuntimeNotActiveError);
  });

  it('rejects user speech when session is in terminal state FAILED', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    const orchestrator = new ConversationOrchestrator(store, transport, model);

    const session = createCallSession({
      callId,
      organizationId,
      agentId: '22222222-2222-2222-2222-222222222222',
      agentVersionId: '33333333-3333-3333-3333-333333333333',
    });
    await store.save(session);
    await orchestrator.handleEvent({
      type: 'provider.failure',
      callId,
      organizationId,
      error: 'SIP Fatal error',
      timestamp: new Date(),
    });

    await expect(
      orchestrator.handleEvent(
        {
          type: 'user.speech.final',
          callId,
          organizationId,
          turnId: 'turn-after-failed',
          transcript: 'Teste',
          timestamp: new Date(),
        },
        mockSnapshot,
      ),
    ).rejects.toThrow(CallRuntimeNotActiveError);
  });

  it('handles call.end.requested by transitioning to ENDED and ending call on transport', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    const orchestrator = new ConversationOrchestrator(store, transport, model);

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

    await orchestrator.handleEvent({
      type: 'call.end.requested',
      callId,
      organizationId,
      reason: 'user hung up',
      timestamp: new Date(),
    });

    const endedSession = await store.getById(organizationId, callId);
    expect(endedSession?.runtimeState).toBe('ENDED');
    expect(endedSession?.endedAt).toBeInstanceOf(Date);
    expect(transport.endCalls).toHaveLength(1);
    expect(transport.endCalls[0]?.reason).toBe('user hung up');
  });

  it('handles provider.failure by transitioning to FAILED and recording failureReason', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    const orchestrator = new ConversationOrchestrator(store, transport, model);

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

    await orchestrator.handleEvent({
      type: 'provider.failure',
      callId,
      organizationId,
      error: 'SIP 503 Service Unavailable',
      timestamp: new Date(),
    });

    const failedSession = await store.getById(organizationId, callId);
    expect(failedSession?.runtimeState).toBe('FAILED');
    expect(failedSession?.failureReason).toBe('SIP 503 Service Unavailable');
    expect(transport.endCalls).toHaveLength(1);
  });

  it('wraps model streaming failures in ConversationModelError', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    const model = new FakeConversationModel();
    model.shouldFail = true;
    const orchestrator = new ConversationOrchestrator(store, transport, model);

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

    await expect(
      orchestrator.handleEvent(
        {
          type: 'user.speech.final',
          callId,
          organizationId,
          turnId: 'turn-1',
          transcript: 'Teste',
          timestamp: new Date(),
        },
        mockSnapshot,
      ),
    ).rejects.toThrow(ConversationModelError);
  });

  it('wraps transport interrupt failures in VoiceTransportError', async () => {
    const store = new InMemoryCallSessionStore();
    const transport = new FakeVoiceTransport();
    transport.shouldFailOnInterrupt = true;
    const model = new FakeConversationModel();
    const orchestrator = new ConversationOrchestrator(store, transport, model);

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

    await expect(
      orchestrator.handleEvent({
        type: 'user.interruption',
        callId,
        organizationId,
        turnId: 'turn-interruption',
        timestamp: new Date(),
      }),
    ).rejects.toThrow(VoiceTransportError);
  });
});
