import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import {
  CallBootstrapAlreadyConsumedError,
  CallBootstrapExpiredError,
  CallBootstrapNotFoundError,
  InvalidAgentVersionStatusError,
} from '@voice-agent/errors';
import { CallLifecycleGateway } from './call-lifecycle-gateway.js';
import { InMemoryCallBootstrapRegistry } from './in-memory-call-bootstrap-registry.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';

describe('CallLifecycleGateway & Server-Side Bootstrap', () => {
  let registry: InMemoryCallBootstrapRegistry;
  let sessionStore: InMemoryCallSessionStore;
  let gateway: CallLifecycleGateway;

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

  const defaultInput = {
    organizationId: '00000000-0000-0000-0000-000000000001',
    agentId: '00000000-0000-0000-0000-000000000002',
    agentVersionId: '00000000-0000-0000-0000-000000000003',
    agentSnapshot: mockSnapshot,
    agentVersionStatus: 'PUBLISHED' as const,
    providerName: 'twilio',
    providerCallId: 'CA_test_sid_123',
    ttlMs: 60_000,
  };

  beforeEach(() => {
    registry = new InMemoryCallBootstrapRegistry();
    sessionStore = new InMemoryCallSessionStore();
    gateway = new CallLifecycleGateway({
      bootstrapRegistry: registry,
      sessionStore,
      defaultTtlMs: 60_000,
    });
  });

  it('prepares call for PUBLISHED agent version and separates callId from providerCallId', async () => {
    const bootstrap = await gateway.prepareCall(defaultInput);

    expect(bootstrap.bootstrapId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(bootstrap.callId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(bootstrap.callId).not.toBe(defaultInput.providerCallId);
    expect(bootstrap.providerCallId).toBe('CA_test_sid_123');
    expect(bootstrap.status).toBe('PENDING');
    expect(bootstrap.organizationId).toBe(defaultInput.organizationId);
  });

  it('rejects call preparation for DRAFT or ARCHIVED agent version status', async () => {
    await expect(
      gateway.prepareCall({ ...defaultInput, agentVersionStatus: 'DRAFT' }),
    ).rejects.toThrow(InvalidAgentVersionStatusError);

    await expect(
      gateway.prepareCall({ ...defaultInput, agentVersionStatus: 'ARCHIVED' }),
    ).rejects.toThrow(InvalidAgentVersionStatusError);
  });

  it('consumes bootstrap atomically and initializes CallSession in CREATED state', async () => {
    const bootstrap = await gateway.prepareCall(defaultInput);
    const result = await gateway.consumeBootstrapAndInitializeSession(bootstrap.bootstrapId);

    expect(result.session.callId).toBe(bootstrap.callId);
    expect(result.session.organizationId).toBe(defaultInput.organizationId);
    expect(result.session.runtimeState).toBe('CREATED');
    expect(result.snapshot).toEqual(mockSnapshot);

    const saved = await sessionStore.getById(defaultInput.organizationId, bootstrap.callId);
    expect(saved).not.toBeNull();
    expect(saved?.runtimeState).toBe('CREATED');

    const updatedBootstrap = await gateway.getBootstrap(bootstrap.bootstrapId);
    expect(updatedBootstrap?.status).toBe('CONSUMED');
  });

  it('rejects second consume attempt on the same bootstrap (consume-once / race protection)', async () => {
    const bootstrap = await gateway.prepareCall(defaultInput);

    // First consume succeeds
    await gateway.consumeBootstrapAndInitializeSession(bootstrap.bootstrapId);

    // Second consume fails
    await expect(
      gateway.consumeBootstrapAndInitializeSession(bootstrap.bootstrapId),
    ).rejects.toThrow(CallBootstrapAlreadyConsumedError);
  });

  it('rejects consumption of expired bootstrap token', async () => {
    const bootstrap = await gateway.prepareCall({ ...defaultInput, ttlMs: 1_000 });
    const futureDate = new Date(Date.now() + 5_000);

    await expect(
      gateway.consumeBootstrapAndInitializeSession(bootstrap.bootstrapId, futureDate),
    ).rejects.toThrow(CallBootstrapExpiredError);
  });

  it('rejects consumption of non-existent bootstrap token', async () => {
    await expect(
      gateway.consumeBootstrapAndInitializeSession('00000000-0000-0000-0000-999999999999'),
    ).rejects.toThrow(CallBootstrapNotFoundError);
  });
});
