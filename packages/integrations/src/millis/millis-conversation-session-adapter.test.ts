import { describe, expect, it, vi } from 'vitest';
import {
  conversationSessionPreparationSchema,
  evaluatePreparationValidity,
  type ConversationSessionPreparationRequest,
} from '@voice-agent/contracts';
import {
  MillisConversationSessionAdapter,
  mapMillisCallStatus,
} from './millis-conversation-session-adapter.js';
import {
  FakeMillisConversationSimulator,
  type FakeRegisterOutcome,
} from './fake-millis-conversation-simulator.js';
import { validateMillisConfig } from './millis-config.js';

const request: ConversationSessionPreparationRequest = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  attemptId: '22222222-2222-4222-8222-222222222222',
  correlationId: '44444444-4444-4444-8444-444444444444',
  agentVersionId: '66666666-6666-4666-8666-666666666666',
};
const AGENT_CONFIG = { prompt: 'Você é um assistente.', language: 'pt-BR' };

function setup(options: { enabled?: boolean; agent?: boolean } = {}) {
  const simulator = new FakeMillisConversationSimulator();
  const reportOrphanRisk = vi.fn();
  const resolvePublishedAgent = vi.fn(async () =>
    options.agent === false ? null : { agentConfig: AGENT_CONFIG },
  );
  const adapter = new MillisConversationSessionAdapter({
    config: validateMillisConfig({
      enabled: options.enabled ?? true,
      region: 'us-west',
      requestTimeoutMs: 5_000,
    }),
    transport: simulator,
    resolvePublishedAgent,
    reportOrphanRisk,
  });
  return { simulator, adapter, reportOrphanRisk, resolvePublishedAgent };
}

describe('S3 — prepare (register_sip_call)', () => {
  it.each([
    ['sip_uri', true],
    ['sip', true],
    ['sip_uri', false],
  ] as const)(
    'accepts URI key %s (session_id present: %s) with unknown validity',
    async (uriKey, withSessionId) => {
      const { simulator, adapter } = setup();
      simulator.queueRegisterOutcome({ kind: 'OK', uriKey, withSessionId });
      const result = await adapter.prepare(request);
      expect(conversationSessionPreparationSchema.parse(result)).toEqual(result);
      expect(result).toMatchObject({
        kind: 'PREPARED',
        mediaTarget: { kind: 'SIP_URI', uri: 'sip:call-000001@sip.millis.example.test' },
        expiresAt: null,
      });
      if (result.kind === 'PREPARED')
        expect(evaluatePreparationValidity(result, new Date())).toBe('UNKNOWN');
      expect(simulator.registerCount).toBe(1);
    },
  );

  it('sends only documented fields, the published config and an opaque correlation id', async () => {
    const { simulator, adapter } = setup();
    await adapter.prepare(request);
    const body = simulator.requests[0]!.body as Record<string, unknown>;
    expect(body).toEqual({
      agent_config: AGENT_CONFIG,
      metadata: { correlation_id: request.correlationId },
      include_metadata_in_prompt: false,
    });
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      request.organizationId,
      request.attemptId,
      'to_phone',
      'from_phone',
      '+55',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('disabled adapter or unpublished agent → UNAVAILABLE/REJECTED with zero requests', async () => {
    for (const options of [{ enabled: false }, { agent: false }]) {
      const { simulator, adapter } = setup(options);
      expect(await adapter.prepare(request)).toEqual({ kind: 'UNAVAILABLE', reason: 'REJECTED' });
      expect(simulator.requests).toHaveLength(0);
    }
  });

  it.each<[string, FakeRegisterOutcome, string, boolean]>([
    ['auth failure 401', { kind: 'HTTP_ERROR', status: 401 }, 'REJECTED', false],
    ['validation 422', { kind: 'HTTP_ERROR', status: 422 }, 'REJECTED', false],
    ['rate limited 429', { kind: 'HTTP_ERROR', status: 429 }, 'PROVIDER_DOWN', false],
    ['provider down 503', { kind: 'HTTP_ERROR', status: 503 }, 'PROVIDER_DOWN', false],
    ['timeout', { kind: 'NO_RESPONSE', cause: 'TIMEOUT' }, 'TIMEOUT', false],
    ['network', { kind: 'NO_RESPONSE', cause: 'NETWORK' }, 'PROVIDER_DOWN', false],
    ['conflicting URI keys', { kind: 'CONFLICTING_URIS' }, 'REJECTED', true],
    ['missing URI', { kind: 'MISSING_URI' }, 'REJECTED', true],
    ['URI with parameters', { kind: 'UNSAFE_URI' }, 'REJECTED', true],
  ])('%s → UNAVAILABLE %s (orphan cleanup: %s)', async (_name, outcome, reason, cleaned) => {
    const { simulator, adapter } = setup();
    simulator.queueRegisterOutcome(outcome);
    expect(await adapter.prepare(request)).toEqual({ kind: 'UNAVAILABLE', reason });
    const terminations = simulator.requests.filter((r) => r.path.endsWith('/terminate'));
    expect(terminations).toHaveLength(cleaned ? 1 : 0);
    if (cleaned) expect([...simulator.sessions.values()][0]!.callStatus).toBe('api-ended');
  });

  it('unreadable body or lost response is reported as orphan risk (no ids to clean)', async () => {
    for (const outcome of [
      { kind: 'GARBAGE' },
      { kind: 'NO_RESPONSE', cause: 'TIMEOUT' },
    ] as const) {
      const { simulator, adapter, reportOrphanRisk } = setup();
      simulator.queueRegisterOutcome(outcome);
      expect((await adapter.prepare(request)).kind).toBe('UNAVAILABLE');
      expect(reportOrphanRisk).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(reportOrphanRisk.mock.calls)).not.toContain(request.correlationId);
    }
  });

  it('a throwing transport is PROVIDER_DOWN', async () => {
    const adapter = new MillisConversationSessionAdapter({
      config: validateMillisConfig({ enabled: true, region: 'eu-west', requestTimeoutMs: 5_000 }),
      transport: { send: async () => Promise.reject(new Error('down')) },
      resolvePublishedAgent: async () => ({ agentConfig: {} }),
    });
    expect(await adapter.prepare(request)).toEqual({
      kind: 'UNAVAILABLE',
      reason: 'PROVIDER_DOWN',
    });
  });
});

describe('S3 — terminate and status (call-logs)', () => {
  async function prepared(withSessionId = true) {
    const ctx = setup();
    ctx.simulator.queueRegisterOutcome({ kind: 'OK', uriKey: 'sip_uri', withSessionId });
    const result = await ctx.adapter.prepare(request);
    if (result.kind !== 'PREPARED') throw new Error('setup');
    return {
      ...ctx,
      ref: { organizationId: request.organizationId, sessionRef: result.sessionRef },
    };
  }

  it('status follows the official call_status enum and terminate is idempotent', async () => {
    const { simulator, adapter, ref } = await prepared();
    expect(await adapter.getStatus(ref)).toBe('ACTIVE');
    simulator.endSession('sess_000001', 'agent-ended');
    expect(await adapter.getStatus(ref)).toBe('ENDED');
    expect(await adapter.terminate(ref)).toBe('TERMINATED');
    expect(await adapter.terminate(ref)).toBe('TERMINATED');
  });

  it('without session_id the session cannot be addressed: UNKNOWN and no request', async () => {
    const { simulator, adapter, ref } = await prepared(false);
    const before = simulator.requests.length;
    expect(await adapter.terminate(ref)).toBe('UNKNOWN');
    expect(await adapter.getStatus(ref)).toBe('UNKNOWN');
    expect(simulator.requests).toHaveLength(before);
  });

  it('forged or path-traversal references never reach the transport', async () => {
    const { simulator, adapter } = await prepared();
    const before = simulator.requests.length;
    const forged = [
      'm1.x.' + Buffer.from('../users').toString('base64url'),
      'm1.x.' + Buffer.from('a/b').toString('base64url'),
      'zz.x.y',
      'm1.x.y.z',
      'sess_000001',
    ];
    for (const sessionRef of forged) {
      expect(await adapter.terminate({ organizationId: request.organizationId, sessionRef })).toBe(
        'UNKNOWN',
      );
    }
    expect(simulator.requests).toHaveLength(before);
  });

  it('unknown session is NOT_FOUND', async () => {
    const { adapter } = await prepared();
    const sessionRef = 'm1.eA.' + Buffer.from('sess_999999').toString('base64url');
    expect(await adapter.getStatus({ organizationId: request.organizationId, sessionRef })).toBe(
      'NOT_FOUND',
    );
  });

  it.each([
    ['registered', 'ACTIVE'],
    ['in-progress', 'ACTIVE'],
    ['user-ended', 'ENDED'],
    ['api-ended', 'ENDED'],
    ['error', 'ENDED'],
    ['unknown', 'UNKNOWN'],
    ['chat_completion', 'UNKNOWN'],
    ['made-up', 'UNKNOWN'],
    [null, 'UNKNOWN'],
  ] as const)('maps call_status %j → %s', (value, expected) => {
    expect(mapMillisCallStatus(value)).toBe(expected);
  });
});
