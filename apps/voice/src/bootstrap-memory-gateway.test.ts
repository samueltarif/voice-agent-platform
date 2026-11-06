import { describe, expect, it } from 'vitest';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { CallBootstrapAlreadyConsumedError, CallBootstrapNotFoundError } from '@voice-agent/errors';
import type { Logger } from '@voice-agent/logger';
import {
  CallBootstrapCapacityExceededError,
  DEFAULT_MAX_BOOTSTRAP_REGISTRY_ENTRIES,
  DEFAULT_MAX_PENDING_PREPARATIONS,
} from './bootstrap-memory-limits.js';
import { CallLifecycleGateway } from './call-lifecycle-gateway.js';
import { InMemoryCallBootstrapRegistry } from './in-memory-call-bootstrap-registry.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';
import {
  buildPublishedVersionToolExecutionContext,
  createPublishedVersionToolAuthorizer,
} from './published-version-toolset.js';

const T0 = Date.parse('2026-11-05T12:00:00.000Z');
const TTL = 60_000;
const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const SECRET = 'objetivo-confidencial-do-tenant';

const snapshot = (): AgentConfigurationSnapshotV1 => ({
  persona: {
    role: 'Atendente',
    companyName: 'Empresa Exemplo',
    objective: SECRET,
    tone: 'FORMAL',
    greetingPhrase: 'Olá',
    closingPhrase: 'Tchau',
    fallbackPhrase: 'Pode repetir?',
  },
  voice: { languageCode: 'pt-BR' },
  rules: { conversational: ['Seja cordial'], deterministic: { operatingHours: '8h-18h' } },
  tools: ['agent.operating_hours'],
});

function setup(options: { pending?: number; registryMax?: number } = {}) {
  let now = T0;
  const clock = () => new Date(now);
  const logs: unknown[] = [];
  const record = (...args: unknown[]) => void logs.push(args);
  const logger: Logger = { info: record, warn: record, error: record, debug: record };
  const registry = new InMemoryCallBootstrapRegistry({ maxEntries: options.registryMax, clock });
  const gateway = new CallLifecycleGateway({
    bootstrapRegistry: registry,
    sessionStore: new InMemoryCallSessionStore(),
    maxPendingPreparations: options.pending,
    clock,
    logger,
    defaultTtlMs: TTL,
  });
  const prepare = (organizationId = ORG_A) =>
    gateway.prepareCall({
      organizationId,
      agentId: '33333333-3333-4333-8333-333333333333',
      agentVersionId: '44444444-4444-4444-8444-444444444444',
      agentSnapshot: snapshot(),
      agentVersionStatus: 'PUBLISHED',
    });
  const consume = (id: string) => gateway.consumeBootstrapAndInitializeSession(id, clock());
  return { registry, gateway, prepare, consume, logs, advanceTo: (ms: number) => void (now = ms) };
}

describe('CallLifecycleGateway — bounded preparations (A1, A2)', () => {
  it('uses conservative defaults: 1,000 pending and 2,000 registry entries', () => {
    expect(DEFAULT_MAX_PENDING_PREPARATIONS).toBe(1_000);
    expect(DEFAULT_MAX_BOOTSTRAP_REGISTRY_ENTRIES).toBe(2_000);
    expect(() => setup({ pending: 0 })).toThrow(TypeError);
  });

  it('refuses when full without evicting valid preparations, which still issue grants', async () => {
    const { prepare, consume, registry, logs } = setup({ pending: 2 });
    const a = await prepare();
    const b = await prepare();
    await expect(prepare()).rejects.toBeInstanceOf(CallBootstrapCapacityExceededError);
    expect(registry.size).toBe(2);
    expect((await consume(a.bootstrapId)).toolGrant).not.toBeNull();
    expect((await consume(b.bootstrapId)).toolGrant).not.toBeNull();
    expect(JSON.stringify(logs)).toContain('call.bootstrap.capacity_exceeded');
    expect(JSON.stringify(logs)).not.toContain(SECRET);
  });

  it('an abandoned preparation stops occupying memory once it expires', async () => {
    const { prepare, advanceTo, registry } = setup({ pending: 1 });
    const abandoned = await prepare();
    await expect(prepare()).rejects.toBeInstanceOf(CallBootstrapCapacityExceededError);
    advanceTo(T0 + TTL + 1);
    const next = await prepare();
    expect(await registry.getById(abandoned.bootstrapId)).toBeNull();
    expect(await registry.getById(next.bootstrapId)).not.toBeNull();
  });

  it('leaves no orphan reservation when the registry refuses the bootstrap', async () => {
    const { prepare, consume, advanceTo } = setup({ pending: 1, registryMax: 1 });
    const first = await prepare();
    await consume(first.bootstrapId);
    // A recusa acontece no meio da validade: a reserva recusada ainda NÃO venceu.
    advanceTo(T0 + TTL / 2);
    await expect(prepare()).rejects.toBeInstanceOf(CallBootstrapCapacityExceededError);
    // Só o consumido (vence em T0 + TTL) sai; se a reserva recusada tivesse ficado,
    // o gateway (capacidade 1) continuaria cheio.
    advanceTo(T0 + TTL + 1);
    await expect(prepare()).resolves.toMatchObject({ status: 'PENDING' });
  });
});

describe('CallLifecycleGateway — single use and grants under cleanup (A3, A4)', () => {
  it('a consumed bootstrap never works again, before or after cleanup', async () => {
    const { prepare, consume, advanceTo } = setup();
    const bootstrap = await prepare();
    expect((await consume(bootstrap.bootstrapId)).toolGrant).not.toBeNull();
    await expect(consume(bootstrap.bootstrapId)).rejects.toBeInstanceOf(
      CallBootstrapAlreadyConsumedError,
    );
    advanceTo(T0 + TTL + 1);
    await prepare();
    await expect(consume(bootstrap.bootstrapId)).rejects.toBeInstanceOf(CallBootstrapNotFoundError);
  });

  it('issued grants keep exactly their permissions after cleanups', async () => {
    const { prepare, consume, advanceTo } = setup();
    const grantA = (await consume((await prepare(ORG_A)).bootstrapId)).toolGrant!;
    const grantB = (await consume((await prepare(ORG_B)).bootstrapId)).toolGrant!;
    advanceTo(T0 + 5 * TTL);
    await prepare();
    const authorizeA = createPublishedVersionToolAuthorizer(grantA);
    expect(
      authorizeA('agent.operating_hours', buildPublishedVersionToolExecutionContext(grantA)),
    ).toBe(true);
    expect(
      authorizeA('agent.operating_hours', buildPublishedVersionToolExecutionContext(grantB)),
    ).toBe(false);
    expect(authorizeA('catalog.search', buildPublishedVersionToolExecutionContext(grantA))).toBe(
      false,
    );
  });

  it('concurrent prepare and double consume: one winner per bootstrap, tenant-correct grants', async () => {
    const { prepare, consume, registry } = setup({ pending: 40 });
    const orgs = Array.from({ length: 40 }, (_v, i) => (i % 2 === 0 ? ORG_A : ORG_B));
    const prepared = await Promise.all(orgs.map((org) => prepare(org)));
    const attempts = await Promise.allSettled(
      prepared.flatMap((b) => [consume(b.bootstrapId), consume(b.bootstrapId)]),
    );
    prepared.forEach((_b, k) => {
      const pair = [attempts[2 * k]!, attempts[2 * k + 1]!];
      const won = pair.filter((a) => a.status === 'fulfilled');
      const lost = pair.filter((a) => a.status === 'rejected');
      expect(won).toHaveLength(1);
      expect((lost[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        CallBootstrapAlreadyConsumedError,
      );
      const binding = (won[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof consume>>>).value;
      expect(binding.session.organizationId).toBe(orgs[k]);
      expect(binding.toolGrant?.organizationId).toBe(orgs[k]);
    });
    expect(registry.size).toBe(40);
  });
});
