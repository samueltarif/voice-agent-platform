import { describe, it, expect } from 'vitest';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { InMemoryCallBootstrapRegistry } from './in-memory-call-bootstrap-registry.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';
import { CallLifecycleGateway } from './call-lifecycle-gateway.js';
import {
  OutboundCallLifecycleBootstrapAdapter,
  type AgentSnapshotResolver,
} from './outbound-call-lifecycle-bootstrap-adapter.js';

describe('OutboundCallLifecycleBootstrapAdapter (007E Offline)', () => {
  const bootstrapRegistry = new InMemoryCallBootstrapRegistry();
  const sessionStore = new InMemoryCallSessionStore();
  const gateway = new CallLifecycleGateway({ bootstrapRegistry, sessionStore });

  const validSnapshot: AgentConfigurationSnapshotV1 = {
    persona: {
      role: 'Outbound Assistant',
      companyName: 'ACME Corp',
      objective: 'Call customers',
      tone: 'OBJECTIVE',
      greetingPhrase: 'Olá!',
      closingPhrase: 'Até logo!',
      fallbackPhrase: 'Poderia repetir?',
    },
    voice: { languageCode: 'pt-BR' },
    rules: {
      conversational: ['Be helpful'],
      deterministic: {},
    },
    playbook: { stages: [] },
    examples: [],
  };

  const sampleRequest = {
    organizationId: 'org-tenant-1',
    outboundJobId: 'job-123',
    agentId: 'agent-456',
    agentVersionId: 'ver-789',
    destinationPhone: '+5511999990000',
    idempotencyKey: 'idemp-sample-att-1',
  };

  it('accepts bootstrap and registers CallBootstrap in gateway for published version', async () => {
    const resolver: AgentSnapshotResolver = async (orgId, _agentId, verId) => {
      if (orgId === 'org-tenant-1' && verId === 'ver-789') {
        return { snapshot: validSnapshot, status: 'PUBLISHED' };
      }
      return null;
    };

    const adapter = new OutboundCallLifecycleBootstrapAdapter({
      gateway,
      snapshotResolver: resolver,
    });
    const outcome = await adapter.bootstrapOutboundCall(sampleRequest);

    expect(outcome.kind).toBe('ACCEPTED');
    if (outcome.kind === 'ACCEPTED') {
      expect(outcome.callId).toBeDefined();
      expect(typeof outcome.callId).toBe('string');
    }
  });

  it('returns terminal failure if agent version does not exist', async () => {
    const resolver: AgentSnapshotResolver = async () => null;
    const adapter = new OutboundCallLifecycleBootstrapAdapter({
      gateway,
      snapshotResolver: resolver,
    });

    const outcome = await adapter.bootstrapOutboundCall(sampleRequest);
    expect(outcome.kind).toBe('TERMINAL_FAILURE');
    if (outcome.kind === 'TERMINAL_FAILURE') {
      expect(outcome.reason).toContain('not found for tenant');
    }
  });

  it('returns terminal failure if agent version is DRAFT', async () => {
    const resolver: AgentSnapshotResolver = async () => ({
      snapshot: validSnapshot,
      status: 'DRAFT',
    });

    const adapter = new OutboundCallLifecycleBootstrapAdapter({
      gateway,
      snapshotResolver: resolver,
    });

    const outcome = await adapter.bootstrapOutboundCall(sampleRequest);
    expect(outcome.kind).toBe('TERMINAL_FAILURE');
    if (outcome.kind === 'TERMINAL_FAILURE') {
      expect(outcome.reason).toContain('Only PUBLISHED versions are allowed');
    }
  });
});
