import { e164DestinationSchema, type TelephonyOriginationRequest } from '@voice-agent/contracts';
import {
  validateTwilioOutboundConfig,
  type TwilioOutboundConfig,
} from './twilio-outbound-config.js';
import type { TwilioDialContext } from './twilio-outbound-origination-adapter.js';

/** Fixtures SINTÉTICAS dos testes offline da S2 (nenhum dado real). */
export const TEST_CALLBACK_TOKEN = 'A'.repeat(21) + '_-' + 'b'.repeat(20);
export const TEST_SIP_URI = 'sip:call-0001@sip.example.test';
export const TEST_CALLER_ID = '+5511900000001';
export const TEST_DESTINATION = '+5511900000002';

export function testTwilioConfig(
  overrides: Partial<TwilioOutboundConfig> = {},
): TwilioOutboundConfig {
  return validateTwilioOutboundConfig({
    enabled: true,
    accountSid: `AC${'0'.repeat(32)}`,
    apiBaseUrl: 'https://api.twilio.example.test',
    callbackBaseUrl: 'https://staging.example.test',
    authorizedCallerIds: [TEST_CALLER_ID],
    sipRegion: 'br1',
    sipTransport: 'tls',
    ringTimeoutSeconds: 30,
    maxCallDurationSeconds: 600,
    requestTimeoutMs: 5_000,
    ...overrides,
  });
}

export function testDialContext(overrides: Partial<TwilioDialContext> = {}): TwilioDialContext {
  return {
    callerId: TEST_CALLER_ID,
    sipUri: TEST_SIP_URI,
    callbackToken: TEST_CALLBACK_TOKEN,
    ...overrides,
  };
}

export function testOriginationRequest(
  overrides: Partial<TelephonyOriginationRequest> = {},
): TelephonyOriginationRequest {
  return {
    organizationId: '11111111-1111-4111-8111-111111111111',
    attemptId: '22222222-2222-4222-8222-222222222222',
    jobId: '33333333-3333-4333-8333-333333333333',
    correlationId: '44444444-4444-4444-8444-444444444444',
    agentId: '55555555-5555-4555-8555-555555555555',
    agentVersionId: '66666666-6666-4666-8666-666666666666',
    destination: e164DestinationSchema.parse(TEST_DESTINATION),
    idempotencyKey: 'attempt-key-1',
    ...overrides,
  };
}
