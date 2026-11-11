import { describe, expect, it } from 'vitest';
import {
  buildDialSipTwiml,
  buildSipTargetUri,
  TWILIO_TWIML_MAX_LENGTH,
  UnsafeTwimlInputError,
} from './twilio-dial-sip-twiml.js';
import { buildCreateCallForm } from './twilio-outbound-origination-adapter.js';
import {
  TwilioOutboundConfigError,
  TwilioRestCredentials,
  validateTwilioOutboundConfig,
} from './twilio-outbound-config.js';
import {
  TEST_CALLBACK_TOKEN,
  TEST_DESTINATION,
  TEST_SIP_URI,
  testDialContext,
  testTwilioConfig,
} from './twilio-outbound-test-fixtures.js';

const config = testTwilioConfig();
const token = TEST_CALLBACK_TOKEN;

describe('S2 — TwiML <Dial><Sip> outbound', () => {
  it('produces the exact documented TwiML with token on every callback URL', () => {
    expect(buildDialSipTwiml({ config, sipUri: TEST_SIP_URI, callbackToken: token })).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response>' +
        `<Dial timeLimit="600" action="https://staging.example.test/v1/provider-webhooks/twilio/ai-leg-result?t=${token}"` +
        ' method="POST" record="do-not-record">' +
        '<Sip statusCallbackEvent="initiated ringing answered completed"' +
        ` statusCallback="https://staging.example.test/v1/provider-webhooks/twilio/ai-leg-status?t=${token}"` +
        ' statusCallbackMethod="POST">' +
        'sip:call-0001@sip.example.test;region=br1;transport=tls</Sip></Dial></Response>',
    );
  });

  it.each([
    'sip:a@b.test"><Play>x</Play><Sip>',
    'sip:a@b.test<x>',
    'sip:a b@b.test',
    'sip:a@b.test\n',
    'sip:a@b.test?X-Header=1',
    'sip:a@b.test;transport=udp',
    'sips:a@b.test',
    'tel:+5511900000002',
    'sip:@b.test',
    `sip:${'a'.repeat(240)}@b.test`,
  ])('refuses unsafe or unexpected SIP URI %j', (sipUri) => {
    expect(() => buildDialSipTwiml({ config, sipUri, callbackToken: token })).toThrow(
      UnsafeTwimlInputError,
    );
  });

  it('escapes XML special characters that the strict URI pattern allows', () => {
    const sip = buildSipTargetUri(config, "sip:a&b'c@b.test");
    const twiml = buildDialSipTwiml({ config, sipUri: "sip:a&b'c@b.test", callbackToken: token });
    expect(sip).toContain("a&b'c");
    expect(twiml).toContain('sip:a&amp;b&apos;c@b.test');
    expect(twiml).not.toContain("a&b'c");
  });

  it('refuses malformed callback tokens', () => {
    for (const bad of ['', 'short', `${token}x`, `${token.slice(1)}&`]) {
      expect(() => buildDialSipTwiml({ config, sipUri: TEST_SIP_URI, callbackToken: bad })).toThrow(
        UnsafeTwimlInputError,
      );
    }
  });

  it('stays below the documented 4.000-character limit', () => {
    const twiml = buildDialSipTwiml({ config, sipUri: TEST_SIP_URI, callbackToken: token });
    expect(twiml.length).toBeLessThanOrEqual(TWILIO_TWIML_MAX_LENGTH);
  });
});

describe('S2 — Calls API create form', () => {
  it('sets duration limits, status events and never AMD or recording', () => {
    const form = buildCreateCallForm(config, testDialContext(), TEST_DESTINATION);
    const keys = form.map(([key]) => key);
    expect(Object.fromEntries(form)).toMatchObject({
      To: TEST_DESTINATION,
      From: '+5511900000001',
      Timeout: '30',
      TimeLimit: '600',
      StatusCallbackMethod: 'POST',
      StatusCallback: `https://staging.example.test/v1/provider-webhooks/twilio/events?t=${token}`,
    });
    expect(form.filter(([key]) => key === 'StatusCallbackEvent').map(([, v]) => v)).toEqual([
      'initiated',
      'ringing',
      'answered',
      'completed',
    ]);
    expect(keys).not.toContain('MachineDetection');
    expect(keys).not.toContain('Record');
    expect(keys).not.toContain('Url');
  });
});

describe('S2 — configuration and credentials', () => {
  it.each([
    ['accountSid', { accountSid: 'AC123' }],
    ['apiBaseUrl', { apiBaseUrl: 'http://api.twilio.com' }],
    ['callbackBaseUrl', { callbackBaseUrl: 'https://staging.example.test/' }],
    ['callbackBaseUrl', { callbackBaseUrl: 'https://staging.example.test/?x=1' }],
    ['authorizedCallerIds', { authorizedCallerIds: [] }],
    ['authorizedCallerIds', { authorizedCallerIds: ['11900000001'] }],
    ['ringTimeoutSeconds', { ringTimeoutSeconds: 601 }],
    ['maxCallDurationSeconds', { maxCallDurationSeconds: 14_401 }],
    ['maxCallDurationSeconds', { maxCallDurationSeconds: 30, ringTimeoutSeconds: 30 }],
    ['sipRegion', { sipRegion: 'sa1' as never }],
  ])('rejects invalid %s', (_field, overrides) => {
    expect(() => validateTwilioOutboundConfig({ ...config, ...overrides })).toThrow(
      TwilioOutboundConfigError,
    );
  });

  it('never exposes credentials through string or JSON conversion', () => {
    const secret = 's3cr3t-value-0123456789';
    const credentials = new TwilioRestCredentials(`SK${'a'.repeat(32)}`, secret);
    expect(String(credentials)).not.toContain(secret);
    expect(JSON.stringify({ credentials })).not.toContain(secret);
    expect(credentials.basicAuthorizationHeader()).toMatch(/^Basic /);
    expect(() => new TwilioRestCredentials('user', secret)).toThrow(TwilioOutboundConfigError);
  });
});
