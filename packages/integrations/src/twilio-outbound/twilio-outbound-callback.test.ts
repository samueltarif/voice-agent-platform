import { describe, expect, it } from 'vitest';
import type { ProviderWebhookRequest } from '@voice-agent/contracts';
import {
  createTwilioOutboundCallbackAuthenticator,
  readCallbackTokenFromUrl,
  TwilioAuthToken,
} from './twilio-outbound-callback-authenticator.js';
import {
  buildDialActionTwiml,
  normalizeTwilioOutboundCallback,
} from './twilio-outbound-callback-normalizer.js';
import { TwilioOutboundOriginationAdapter } from './twilio-outbound-origination-adapter.js';
import {
  FAKE_TWILIO_AUTH_TOKEN,
  FakeTwilioOriginationSimulator,
} from './fake-twilio-origination-simulator.js';
import type { FakeCallbackDelivery, FakeCallScenario } from './fake-twilio-callback-script.js';
import { signFakeTwilioCallback } from './fake-twilio-callback-script.js';
import {
  TEST_CALLBACK_TOKEN,
  testDialContext,
  testOriginationRequest,
  testTwilioConfig,
} from './twilio-outbound-test-fixtures.js';

const attempt = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  attemptId: '22222222-2222-4222-8222-222222222222',
};
const authenticator = createTwilioOutboundCallbackAuthenticator(
  new TwilioAuthToken(FAKE_TWILIO_AUTH_TOKEN),
);
const startedAt = new Date('2026-11-11T12:00:00.000Z');

async function scenario(name: FakeCallScenario): Promise<FakeCallbackDelivery[]> {
  const simulator = new FakeTwilioOriginationSimulator();
  const adapter = new TwilioOutboundOriginationAdapter({
    config: testTwilioConfig(),
    transport: simulator,
    resolveDialContext: async () => testDialContext(),
  });
  const result = await adapter.originate(testOriginationRequest());
  if (result.kind !== 'ACCEPTED') throw new Error('setup');
  return simulator.callbacksFor(result.providerReference!, name, startedAt);
}

function asRequest(
  delivery: FakeCallbackDelivery,
  overrides: Partial<ProviderWebhookRequest> = {},
) {
  return {
    provider: 'twilio',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': delivery.signature,
    },
    rawBody: new URLSearchParams(delivery.params).toString(),
    receivedAt: startedAt,
    url: delivery.url,
    ...overrides,
  };
}

function normalize(delivery: FakeCallbackDelivery) {
  const input = {
    endpoint: delivery.endpoint,
    params: delivery.params,
    attempt,
    receivedAt: startedAt,
  };
  return normalizeTwilioOutboundCallback(input);
}

describe('S2 — callback authentication (X-Twilio-Signature over URL with token)', () => {
  it('accepts every scripted delivery and carries the attempt token in the URL', async () => {
    for (const delivery of await scenario('ANSWERED_AND_COMPLETED')) {
      expect(await authenticator.authenticate(asRequest(delivery))).toEqual({
        kind: 'AUTHENTICATED',
      });
      expect(readCallbackTokenFromUrl(delivery.url)).toBe(TEST_CALLBACK_TOKEN);
    }
  });

  it('rejects swapped token, tampered body, missing URL/signature, non-form and duplicates', async () => {
    const [first] = await scenario('BUSY');
    const otherToken = 'Z'.repeat(43);
    const swappedUrl = first!.url.replace(TEST_CALLBACK_TOKEN, otherToken);
    const cases: Array<Partial<ProviderWebhookRequest>> = [
      { url: swappedUrl },
      { rawBody: new URLSearchParams({ ...first!.params, CallStatus: 'completed' }).toString() },
      { url: undefined },
      { headers: { 'content-type': 'application/x-www-form-urlencoded' } },
      { headers: { 'content-type': 'application/json', 'x-twilio-signature': first!.signature } },
      { rawBody: `${new URLSearchParams(first!.params).toString()}&CallStatus=busy` },
      { url: first!.url.replace(`t=${TEST_CALLBACK_TOKEN}`, 't=short') },
    ];
    for (const overrides of cases) {
      expect((await authenticator.authenticate(asRequest(first!, overrides))).kind).toBe(
        'REJECTED',
      );
    }
  });

  it('a delivery re-signed for a swapped token still fails without the real auth token', async () => {
    const [first] = await scenario('BUSY');
    const url = first!.url.replace(TEST_CALLBACK_TOKEN, 'Z'.repeat(43));
    const forged = signFakeTwilioCallback('ffffffffffffffffffffffffffffffff', url, first!.params);
    const base = asRequest(first!, { url });
    const request = { ...base, headers: { ...base.headers, 'x-twilio-signature': forged } };
    expect(await authenticator.authenticate(request)).toEqual({
      kind: 'REJECTED',
      reason: 'INVALID_CREDENTIALS',
    });
  });

  it('is fail-closed without an auth token', async () => {
    const [first] = await scenario('BUSY');
    const closed = createTwilioOutboundCallbackAuthenticator(null);
    expect(await closed.authenticate(asRequest(first!))).toEqual({
      kind: 'REJECTED',
      reason: 'NOT_CONFIGURED',
    });
  });
});

describe('S2 — callback normalization to neutral leg events', () => {
  it('answered call: contact leg, AI agent leg with parent, and bridge result', async () => {
    const events = (await scenario('ANSWERED_AND_COMPLETED')).map(normalize);
    expect(events.every((event) => event !== null)).toBe(true);
    const states = events.map((e) =>
      e!.type === 'CALL_LEG_STATUS' ? `${e!.role}:${e!.state}` : `RESULT:${e!.bridgeStatus}`,
    );
    expect(states).toEqual([
      'CONTACT_LEG:INITIATED',
      'CONTACT_LEG:RINGING',
      'CONTACT_LEG:ANSWERED',
      'AI_AGENT_LEG:INITIATED',
      'AI_AGENT_LEG:RINGING',
      'AI_AGENT_LEG:ANSWERED',
      'AI_AGENT_LEG:COMPLETED',
      'RESULT:COMPLETED',
      'CONTACT_LEG:COMPLETED',
    ]);
    const aiLeg = events.find((e) => e!.type === 'CALL_LEG_STATUS' && e!.role === 'AI_AGENT_LEG');
    expect(aiLeg).toMatchObject({
      parentLegReference:
        events[0]!.type === 'CALL_LEG_STATUS' ? events[0]!.providerLegReference : '',
    });
    expect(events.every((e) => e!.organizationId === attempt.organizationId)).toBe(true);
  });

  it('SIP failure after answer keeps the transport response code', async () => {
    const events = (await scenario('ANSWERED_THEN_SIP_FAILURE')).map(normalize);
    expect(events.find((e) => e!.type === 'AI_AGENT_LEG_RESULT')).toMatchObject({
      bridgeStatus: 'FAILED',
      transportResponseCode: 480,
    });
  });

  it.each([
    ['BUSY', 'BUSY'],
    ['NO_ANSWER', 'NO_ANSWER'],
    ['FAILED', 'FAILED'],
  ] as const)('%s ends the contact leg without any AI leg', async (name, state) => {
    const events = (await scenario(name)).map(normalize);
    expect(events.at(-1)).toMatchObject({ role: 'CONTACT_LEG', state });
    expect(events.some((e) => e!.type === 'CALL_LEG_STATUS' && e!.role === 'AI_AGENT_LEG')).toBe(
      false,
    );
  });

  it('quarantines malformed or undocumented payloads (null) and ignores payload tenant fields', async () => {
    const [first] = await scenario('BUSY');
    const bad = [
      { ...first!.params, CallStatus: 'exploded' },
      { ...first!.params, CallSid: 'CA123' },
    ];
    for (const params of bad) {
      expect(
        normalizeTwilioOutboundCallback({
          endpoint: 'CALL_STATUS',
          params,
          attempt,
          receivedAt: startedAt,
        }),
      ).toBeNull();
    }
    const childWithoutParent = { CallSid: `CA${'c'.repeat(32)}`, CallStatus: 'ringing' };
    expect(
      normalizeTwilioOutboundCallback({
        endpoint: 'AI_LEG_STATUS',
        params: childWithoutParent,
        attempt,
        receivedAt: startedAt,
      }),
    ).toBeNull();
    const withTenant = {
      ...first!.params,
      organizationId: 'attacker-org',
      AccountSid: `AC${'9'.repeat(32)}`,
    };
    expect(
      normalizeTwilioOutboundCallback({
        endpoint: 'CALL_STATUS',
        params: withTenant,
        attempt,
        receivedAt: startedAt,
      }),
    ).toMatchObject({ organizationId: attempt.organizationId });
  });

  it('Dial action always answers with Hangup (line never left silent)', () => {
    expect(buildDialActionTwiml()).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
    );
  });
});
