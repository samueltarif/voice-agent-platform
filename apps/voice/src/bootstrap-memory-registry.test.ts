import { describe, expect, it } from 'vitest';
import type { AgentConfigurationSnapshotV1, CallBootstrap } from '@voice-agent/contracts';
import {
  CallBootstrapAlreadyConsumedError,
  CallBootstrapExpiredError,
  CallBootstrapNotFoundError,
} from '@voice-agent/errors';
import { CallBootstrapCapacityExceededError } from './bootstrap-memory-limits.js';
import { InMemoryCallBootstrapRegistry } from './in-memory-call-bootstrap-registry.js';

const T0 = Date.parse('2026-11-05T12:00:00.000Z');
const TTL = 60_000;
const SECRET = 'objetivo-confidencial-do-tenant';

const snapshot: AgentConfigurationSnapshotV1 = {
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
  rules: { conversational: ['Seja cordial'], deterministic: {} },
};

function bootstrap(n: number, overrides: Partial<CallBootstrap> = {}): CallBootstrap {
  return {
    bootstrapId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    callId: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    organizationId: '11111111-1111-4111-8111-111111111111',
    agentId: '33333333-3333-4333-8333-333333333333',
    agentVersionId: '44444444-4444-4444-8444-444444444444',
    agentSnapshot: snapshot,
    status: 'PENDING',
    createdAt: new Date(T0),
    expiresAt: new Date(T0 + TTL),
    ...overrides,
  };
}

function setup(maxEntries = 10) {
  let now = T0;
  const registry = new InMemoryCallBootstrapRegistry({ maxEntries, clock: () => new Date(now) });
  return { registry, advanceTo: (ms: number) => void (now = ms) };
}

describe('InMemoryCallBootstrapRegistry — expiry cleanup (A1)', () => {
  it('keeps a non-expired entry (even at the exact expiry instant) and removes it only after', async () => {
    const { registry, advanceTo } = setup();
    await registry.register(bootstrap(1));
    advanceTo(T0 + TTL);
    await registry.register(bootstrap(2, { expiresAt: new Date(T0 + 3 * TTL) }));
    expect(await registry.getById(bootstrap(1).bootstrapId)).not.toBeNull();
    advanceTo(T0 + TTL + 1);
    await registry.register(bootstrap(3, { expiresAt: new Date(T0 + 3 * TTL) }));
    expect(await registry.getById(bootstrap(1).bootstrapId)).toBeNull();
    expect(registry.size).toBe(2);
  });

  it('cleans with the trusted clock, never with the caller-supplied consume time', async () => {
    const { registry } = setup();
    await registry.register(bootstrap(1));
    await registry.register(bootstrap(2));
    await expect(
      registry.consume(bootstrap(1).bootstrapId, new Date(T0 + 10 * TTL)),
    ).rejects.toBeInstanceOf(CallBootstrapExpiredError);
    await expect(registry.consume(bootstrap(2).bootstrapId, new Date(T0))).resolves.toMatchObject({
      status: 'CONSUMED',
    });
  });
});

describe('InMemoryCallBootstrapRegistry — single use survives cleanup (A3)', () => {
  it('a consumed bootstrap is refused before and after its record is discarded', async () => {
    const { registry, advanceTo } = setup();
    const original = bootstrap(1);
    await registry.register(original);
    await registry.consume(original.bootstrapId, new Date(T0));
    await expect(registry.consume(original.bootstrapId, new Date(T0))).rejects.toBeInstanceOf(
      CallBootstrapAlreadyConsumedError,
    );
    await expect(registry.register({ ...original })).rejects.toThrow(TypeError);
    advanceTo(T0 + TTL + 1);
    await expect(registry.consume(original.bootstrapId, new Date(T0))).rejects.toBeInstanceOf(
      CallBootstrapNotFoundError,
    );
    await expect(registry.register(original)).rejects.toBeInstanceOf(CallBootstrapExpiredError);
    await expect(registry.consume(original.bootstrapId, new Date(T0))).rejects.toBeInstanceOf(
      CallBootstrapNotFoundError,
    );
  });

  it('refuses invalid registrations: non-PENDING, bad dates, empty id or already expired', async () => {
    const { registry } = setup();
    const invalid = [
      bootstrap(1, { status: 'CONSUMED' }),
      bootstrap(2, { status: 'EXPIRED' }),
      bootstrap(3, { expiresAt: new Date(Number.NaN) }),
      bootstrap(4, { createdAt: 'ontem' as unknown as Date }),
      bootstrap(5, { bootstrapId: '' }),
      bootstrap(6, { expiresAt: new Date(T0 - 1) }),
    ];
    for (const entry of invalid) {
      const error = await registry.register(entry).catch((e: unknown) => e as Error);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain(SECRET);
    }
    expect(registry.size).toBe(0);
  });
});

describe('InMemoryCallBootstrapRegistry — capacity (A2)', () => {
  it('refuses new entries when full and never evicts valid ones', async () => {
    const { registry, advanceTo } = setup(3);
    for (const n of [1, 2, 3]) await registry.register(bootstrap(n));
    await expect(registry.register(bootstrap(4))).rejects.toBeInstanceOf(
      CallBootstrapCapacityExceededError,
    );
    for (const n of [1, 2, 3]) {
      await expect(registry.consume(bootstrap(n).bootstrapId, new Date(T0))).resolves.toBeDefined();
    }
    await expect(registry.register(bootstrap(5))).rejects.toBeInstanceOf(
      CallBootstrapCapacityExceededError,
    );
    advanceTo(T0 + TTL + 1);
    await registry.register(bootstrap(6, { expiresAt: new Date(T0 + 3 * TTL) }));
    expect(registry.size).toBe(1);
    expect(() => new InMemoryCallBootstrapRegistry({ maxEntries: 0 })).toThrow(TypeError);
  });
});
