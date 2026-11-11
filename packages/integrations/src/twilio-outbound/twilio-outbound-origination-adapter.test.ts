import { describe, expect, it, vi } from 'vitest';
import { TwilioOutboundOriginationAdapter } from './twilio-outbound-origination-adapter.js';
import {
  FakeTwilioOriginationSimulator,
  type FakeCreateOutcome,
} from './fake-twilio-origination-simulator.js';
import { createFetchTwilioRestTransport } from './twilio-rest-transport.js';
import { TwilioOutboundDisabledError, TwilioRestCredentials } from './twilio-outbound-config.js';
import {
  testDialContext,
  testOriginationRequest,
  testTwilioConfig,
} from './twilio-outbound-test-fixtures.js';

function setup(
  options: { enabled?: boolean; context?: ReturnType<typeof testDialContext> | null } = {},
) {
  const simulator = new FakeTwilioOriginationSimulator();
  const resolveDialContext = vi.fn(async () =>
    options.context === undefined ? testDialContext() : options.context,
  );
  const adapter = new TwilioOutboundOriginationAdapter({
    config: testTwilioConfig({ enabled: options.enabled ?? true }),
    transport: simulator,
    resolveDialContext,
  });
  return { simulator, adapter, resolveDialContext };
}

describe('S2 — origination guards (no network on refusal)', () => {
  it('disabled adapter refuses before resolving context or sending', async () => {
    const { simulator, adapter, resolveDialContext } = setup({ enabled: false });
    expect(await adapter.originate(testOriginationRequest())).toEqual({
      kind: 'REJECTED',
      reasonCode: 'PROVIDER_REFUSED',
    });
    expect(resolveDialContext).not.toHaveBeenCalled();
    expect(simulator.requests).toHaveLength(0);
  });

  it.each([
    ['no prepared session', null, 'PROVIDER_REFUSED'],
    [
      'unauthorized caller id',
      testDialContext({ callerId: '+5511999999999' }),
      'CALLER_IDENTITY_NOT_AUTHORIZED',
    ],
    ['unsafe SIP URI', testDialContext({ sipUri: 'sip:x@y.test"/><Play>' }), 'PROVIDER_REFUSED'],
  ] as const)('%s → REJECTED without any request', async (_name, context, reasonCode) => {
    const { simulator, adapter } = setup({ context });
    expect(await adapter.originate(testOriginationRequest())).toEqual({
      kind: 'REJECTED',
      reasonCode,
    });
    expect(simulator.requests).toHaveLength(0);
  });

  it('invalid destination is refused before context resolution', async () => {
    const { simulator, adapter, resolveDialContext } = setup();
    const result = await adapter.originate(
      testOriginationRequest({ destination: '11900000002' as never }),
    );
    expect(result).toEqual({ kind: 'REJECTED', reasonCode: 'DESTINATION_NOT_ALLOWED' });
    expect(resolveDialContext).not.toHaveBeenCalled();
    expect(simulator.requests).toHaveLength(0);
  });
});

describe('S2 — Calls API outcomes', () => {
  it.each<[string, FakeCreateOutcome, unknown]>([
    [
      'accepted',
      { kind: 'ACCEPT' },
      { kind: 'ACCEPTED', providerReference: `CA${'0'.repeat(31)}1` },
    ],
    [
      'invalid To (21211)',
      { kind: 'REJECT', status: 400, code: 21211 },
      { kind: 'REJECTED', reasonCode: 'DESTINATION_NOT_ALLOWED' },
    ],
    [
      'geo permission (21215)',
      { kind: 'REJECT', status: 400, code: 21215 },
      { kind: 'REJECTED', reasonCode: 'DESTINATION_NOT_ALLOWED' },
    ],
    [
      'From not verified (21210)',
      { kind: 'REJECT', status: 400, code: 21210 },
      { kind: 'REJECTED', reasonCode: 'CALLER_IDENTITY_NOT_AUTHORIZED' },
    ],
    [
      'too many requests (429)',
      { kind: 'REJECT', status: 429, code: 20429 },
      { kind: 'REJECTED', reasonCode: 'LIMIT_EXCEEDED' },
    ],
    [
      'auth failure (401)',
      { kind: 'REJECT', status: 401, code: 20003 },
      { kind: 'REJECTED', reasonCode: 'PROVIDER_REFUSED' },
    ],
    [
      'server error (500)',
      { kind: 'SERVER_ERROR', status: 500 },
      { kind: 'UNKNOWN', reasonCode: 'AMBIGUOUS_RESPONSE' },
    ],
    [
      'gateway timeout (504)',
      { kind: 'SERVER_ERROR', status: 504 },
      { kind: 'UNKNOWN', reasonCode: 'AMBIGUOUS_RESPONSE' },
    ],
    [
      'request timeout (408)',
      { kind: 'REJECT', status: 408 },
      { kind: 'UNKNOWN', reasonCode: 'TIMEOUT' },
    ],
    [
      'success without sid',
      { kind: 'MALFORMED_SUCCESS' },
      { kind: 'UNKNOWN', reasonCode: 'AMBIGUOUS_RESPONSE' },
    ],
    [
      'lost response after creation',
      { kind: 'ACCEPT_BUT_LOSE_RESPONSE', cause: 'TIMEOUT' },
      { kind: 'UNKNOWN', reasonCode: 'TIMEOUT' },
    ],
    [
      'unreachable',
      { kind: 'UNREACHABLE', cause: 'NETWORK' },
      { kind: 'UNKNOWN', reasonCode: 'TRANSPORT_ERROR' },
    ],
  ])('%s', async (_name, outcome, expected) => {
    const { simulator, adapter } = setup();
    simulator.queueCreateOutcome(outcome);
    expect(await adapter.originate(testOriginationRequest())).toEqual(expected);
    expect(simulator.createRequestCount).toBe(1);
  });

  it('a throwing transport is UNKNOWN, never REJECTED', async () => {
    const adapter = new TwilioOutboundOriginationAdapter({
      config: testTwilioConfig(),
      transport: { send: async () => Promise.reject(new Error('boom')) },
      resolveDialContext: async () => testDialContext(),
    });
    expect(await adapter.originate(testOriginationRequest())).toEqual({
      kind: 'UNKNOWN',
      reasonCode: 'TRANSPORT_ERROR',
    });
  });
});

describe('S2 — reconciliation and hang-up', () => {
  it('lost response: reconciliation by CallSid confirms without a second create', async () => {
    const { simulator, adapter } = setup();
    simulator.queueCreateOutcome({ kind: 'ACCEPT_BUT_LOSE_RESPONSE', cause: 'NETWORK' });
    await adapter.originate(testOriginationRequest());
    const [sid] = [...simulator.calls.keys()];
    const base = { organizationId: 'o', attemptId: 'a', jobId: 'j', correlationId: 'c' };
    expect(await adapter.reconcile({ ...base, providerReference: null })).toEqual({
      kind: 'INCONCLUSIVE',
    });
    expect(await adapter.reconcile({ ...base, providerReference: sid! })).toEqual({
      kind: 'CONFIRMED_ORIGINATED',
      providerReference: sid,
    });
    expect(await adapter.reconcile({ ...base, providerReference: `CA${'f'.repeat(32)}` })).toEqual({
      kind: 'INCONCLUSIVE',
    });
    expect(simulator.createRequestCount).toBe(1);
  });

  it('hang-up is idempotent and cancels a ringing call', async () => {
    const { simulator, adapter } = setup();
    await adapter.originate(testOriginationRequest());
    const [sid] = [...simulator.calls.keys()];
    expect(await adapter.hangUp(sid!)).toBe('ENDED');
    expect(simulator.calls.get(sid!)!.status).toBe('canceled');
    expect(await adapter.hangUp(sid!)).toBe('ENDED');
    expect(await adapter.hangUp(`CA${'e'.repeat(32)}`)).toBe('NOT_FOUND');
    expect(await adapter.hangUp('not-a-sid')).toBe('UNKNOWN');
    expect(simulator.createRequestCount).toBe(1);
  });
});

describe('S2 — fetch transport (injected fetch, never real network)', () => {
  const credentials = new TwilioRestCredentials(`SK${'a'.repeat(32)}`, 'secret-0123456789abcdef');

  it('refuses to send when disabled and refuses paths outside the Calls API', async () => {
    const fetchFn = vi.fn();
    const disabled = createFetchTwilioRestTransport({
      config: testTwilioConfig({ enabled: false }),
      credentials,
      fetchFn,
    });
    await expect(disabled.send({ method: 'GET', path: '/Calls.json' })).rejects.toThrow(
      TwilioOutboundDisabledError,
    );
    const enabled = createFetchTwilioRestTransport({
      config: testTwilioConfig(),
      credentials,
      fetchFn,
    });
    await expect(
      enabled.send({ method: 'GET', path: '/IncomingPhoneNumbers.json' }),
    ).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('targets only the configured account URL with basic auth and form body', async () => {
    const fetchFn = vi.fn(async () => new Response('{"sid":"x"}', { status: 201 }));
    const transport = createFetchTwilioRestTransport({
      config: testTwilioConfig(),
      credentials,
      fetchFn,
    });
    const response = await transport.send({
      method: 'POST',
      path: '/Calls.json',
      form: [['To', '+5511900000002']],
    });
    expect(response).toEqual({ kind: 'HTTP', status: 201, body: { sid: 'x' } });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      `https://api.twilio.example.test/2010-04-01/Accounts/AC${'0'.repeat(32)}/Calls.json`,
    );
    expect(init.body).toBe('To=%2B5511900000002');
    expect((init.headers as Record<string, string>)['Authorization']).toMatch(/^Basic /);
  });

  it('maps network failure and timeout to NO_RESPONSE', async () => {
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    for (const [error, cause] of [
      [timeout, 'TIMEOUT'],
      [new Error('reset'), 'NETWORK'],
    ] as const) {
      const transport = createFetchTwilioRestTransport({
        config: testTwilioConfig(),
        credentials,
        fetchFn: vi.fn(async () => Promise.reject(error)),
      });
      expect(await transport.send({ method: 'GET', path: '/Calls.json' })).toEqual({
        kind: 'NO_RESPONSE',
        cause,
      });
    }
  });
});
