import { describe, expect, it } from 'vitest';
import type {
  AgentConfigurationSnapshotV1,
  CallBootstrap,
  CallBootstrapRegistryPort,
} from '@voice-agent/contracts';
import { CallBootstrapAlreadyConsumedError, CallBootstrapExpiredError } from '@voice-agent/errors';
import type { Logger } from '@voice-agent/logger';
import { CallLifecycleGateway } from './call-lifecycle-gateway.js';
import { InMemoryCallBootstrapRegistry } from './in-memory-call-bootstrap-registry.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';
import { GRANT_FIXTURE_IDS } from './published-tool-grant-fixtures.js';
import { isIssuedPublishedToolGrant } from './published-tool-grant.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const PERSONA_SECRET = 'objetivo-interno-confidencial';

const snapshot = (): AgentConfigurationSnapshotV1 => ({
  persona: {
    role: 'Atendente',
    companyName: 'Empresa Exemplo',
    objective: PERSONA_SECRET,
    tone: 'FORMAL',
    greetingPhrase: 'Olá',
    closingPhrase: 'Tchau',
    fallbackPhrase: 'Pode repetir?',
  },
  voice: { languageCode: 'pt-BR' },
  rules: { conversational: ['Seja cordial'], deterministic: { operatingHours: '8h-18h' } },
  tools: ['agent.operating_hours'],
});

function gatewayWith(registry: CallBootstrapRegistryPort, logs: unknown[] = []) {
  const record = (...args: unknown[]) => void logs.push(args);
  const logger: Logger = { info: record, warn: record, error: record, debug: record };
  return new CallLifecycleGateway({
    bootstrapRegistry: registry,
    sessionStore: new InMemoryCallSessionStore(),
    logger,
  });
}

const prepare = (gateway: CallLifecycleGateway, agentSnapshot = snapshot()) =>
  gateway.prepareCall({
    organizationId: ORG,
    agentId: GRANT_FIXTURE_IDS.agentId,
    agentVersionId: GRANT_FIXTURE_IDS.agentVersionId,
    agentSnapshot,
    agentVersionStatus: 'PUBLISHED',
  });

describe('tool grant issuance — bootstrap origin (E1)', () => {
  it('issues a grant only for a bootstrap prepared and consumed by the same gateway', async () => {
    const gateway = gatewayWith(new InMemoryCallBootstrapRegistry());
    const bootstrap = await prepare(gateway);
    const binding = await gateway.consumeBootstrapAndInitializeSession(bootstrap.bootstrapId);
    expect(isIssuedPublishedToolGrant(binding.toolGrant)).toBe(true);
    expect(binding.toolGrant).toMatchObject({
      organizationId: ORG,
      agentVersionId: GRANT_FIXTURE_IDS.agentVersionId,
      callId: binding.session.callId,
      tools: ['agent.operating_hours'],
    });
  });

  it('issues no grant for a bootstrap injected into the registry without prepareCall', async () => {
    const registry = new InMemoryCallBootstrapRegistry();
    const injected: CallBootstrap = {
      bootstrapId: '77777777-7777-4777-8777-777777777777',
      callId: '88888888-8888-4888-8888-888888888888',
      organizationId: ORG,
      agentId: GRANT_FIXTURE_IDS.agentId,
      agentVersionId: GRANT_FIXTURE_IDS.agentVersionId,
      agentSnapshot: snapshot(),
      status: 'PENDING',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    };
    await registry.register(injected);
    const logs: unknown[] = [];
    const binding = await gatewayWith(registry, logs).consumeBootstrapAndInitializeSession(
      injected.bootstrapId,
    );
    expect(binding.session.organizationId).toBe(ORG);
    expect(binding.toolGrant).toBeNull();
    expect(JSON.stringify(logs)).toContain('call.tool_grant.unavailable');
    expect(JSON.stringify(logs)).not.toContain(PERSONA_SECRET);
  });

  it('issues no grant when another gateway instance prepared the bootstrap', async () => {
    const registry = new InMemoryCallBootstrapRegistry();
    const bootstrap = await prepare(gatewayWith(registry));
    const other = gatewayWith(registry);
    const binding = await other.consumeBootstrapAndInitializeSession(bootstrap.bootstrapId);
    expect(binding.toolGrant).toBeNull();
  });

  it('never issues a grant for reuse, expiry or a registry that reports success twice', async () => {
    const registry = new InMemoryCallBootstrapRegistry();
    const gateway = gatewayWith(registry);
    const bootstrap = await prepare(gateway);
    await gateway.consumeBootstrapAndInitializeSession(bootstrap.bootstrapId);
    await expect(
      gateway.consumeBootstrapAndInitializeSession(bootstrap.bootstrapId),
    ).rejects.toBeInstanceOf(CallBootstrapAlreadyConsumedError);
    const late = await prepare(gateway);
    await expect(
      gateway.consumeBootstrapAndInitializeSession(
        late.bootstrapId,
        new Date(Date.now() + 3_600_000),
      ),
    ).rejects.toBeInstanceOf(CallBootstrapExpiredError);

    const lenient = new InMemoryCallBootstrapRegistry();
    const consumeOnce = lenient.consume.bind(lenient);
    let first: CallBootstrap | undefined;
    lenient.consume = async (id, now) => (first ??= await consumeOnce(id, now));
    const lenientGateway = gatewayWith(lenient);
    const twice = await prepare(lenientGateway);
    const a = await lenientGateway.consumeBootstrapAndInitializeSession(twice.bootstrapId);
    const b = await lenientGateway.consumeBootstrapAndInitializeSession(twice.bootstrapId);
    expect(a.toolGrant).not.toBeNull();
    expect(b.toolGrant).toBeNull();
  });
});

describe('tool grant issuance — tampered registry results', () => {
  const tampering: [string, (c: CallBootstrap) => CallBootstrap][] = [
    [
      'other organization',
      (c) => ({ ...c, organizationId: '99999999-9999-4999-8999-999999999999' }),
    ],
    ['other version', (c) => ({ ...c, agentVersionId: '66666666-6666-4666-8666-666666666666' })],
    ['other call', (c) => ({ ...c, callId: '55555555-5555-4555-8555-555555555555' })],
    ['identical snapshot copy', (c) => ({ ...c, agentSnapshot: structuredClone(c.agentSnapshot) })],
    ['status not CONSUMED', (c) => ({ ...c, status: 'PENDING' })],
  ];
  for (const [label, tamper] of tampering) {
    it(`issues no grant when the consumed bootstrap has ${label}`, async () => {
      const registry = new InMemoryCallBootstrapRegistry();
      const realConsume = registry.consume.bind(registry);
      registry.consume = async (id, now) => tamper(await realConsume(id, now));
      const gateway = gatewayWith(registry);
      const bootstrap = await prepare(gateway);
      const binding = await gateway.consumeBootstrapAndInitializeSession(bootstrap.bootstrapId);
      expect(binding.toolGrant).toBeNull();
    });
  }
});
