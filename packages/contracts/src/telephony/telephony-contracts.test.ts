import { describe, expect, it } from 'vitest';
import { e164DestinationSchema } from './e164-destination.js';
import { FIXTURE_DESTINATION, FIXTURE_IDS, FIXTURE_NOW } from './outbound-attempt-fixtures.js';
import { createOutboundAttempt, deriveAttemptIdempotencyKey } from './outbound-attempt.js';
import { telephonyOriginationRequestSchema } from './telephony-origination-port.js';

describe('E.164 destination', () => {
  it.each([FIXTURE_DESTINATION, '+5500000000000'])('accepts %s', (value) => {
    expect(e164DestinationSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    '',
    '5511900000000',
    '+0123456789',
    '+55 11 90000-0000',
    '+123',
    'abc',
    '+1234567890123456',
  ])('rejects %j', (value) => {
    expect(e164DestinationSchema.safeParse(value).success).toBe(false);
  });
});

describe('origination request', () => {
  const valid = {
    organizationId: FIXTURE_IDS.orgA,
    attemptId: FIXTURE_IDS.attempt,
    jobId: FIXTURE_IDS.job,
    correlationId: FIXTURE_IDS.correlation,
    agentId: FIXTURE_IDS.agent,
    agentVersionId: FIXTURE_IDS.agentVersion,
    destination: FIXTURE_DESTINATION,
    idempotencyKey: 'job-key-att-1',
  };

  it('accepts a complete request and rejects provider-specific extras', () => {
    expect(telephonyOriginationRequestSchema.safeParse(valid).success).toBe(true);
    expect(
      telephonyOriginationRequestSchema.safeParse({ ...valid, providerSid: 'x' }).success,
    ).toBe(false);
  });

  it('rejects missing tenant, attempt identity or invalid destination', () => {
    const { organizationId: _o, ...withoutOrg } = valid;
    expect(telephonyOriginationRequestSchema.safeParse(withoutOrg).success).toBe(false);
    expect(telephonyOriginationRequestSchema.safeParse({ ...valid, attemptId: 'x' }).success).toBe(
      false,
    );
    expect(
      telephonyOriginationRequestSchema.safeParse({ ...valid, destination: '123' }).success,
    ).toBe(false);
  });
});

describe('createOutboundAttempt', () => {
  const input = {
    id: FIXTURE_IDS.attempt,
    organizationId: FIXTURE_IDS.orgA,
    jobId: FIXTURE_IDS.job,
    attemptNumber: 2,
    correlationId: FIXTURE_IDS.correlation,
    agentId: FIXTURE_IDS.agent,
    agentVersionId: FIXTURE_IDS.agentVersion,
    jobIdempotencyKey: 'job-key',
    createdAt: FIXTURE_NOW,
  };

  it('starts in CREATED with a derived local idempotency key and no destination', () => {
    const attempt = createOutboundAttempt(input);
    expect(attempt.state).toBe('CREATED');
    expect(attempt.idempotencyKey).toBe('job-key-att-2');
    expect(attempt.idempotencyKey).toBe(deriveAttemptIdempotencyKey('job-key', 2));
    expect(JSON.stringify(attempt)).not.toContain('+');
  });

  it('rejects invalid input deterministically', () => {
    expect(() => createOutboundAttempt({ ...input, attemptNumber: 0 })).toThrow();
    expect(() => createOutboundAttempt({ ...input, organizationId: 'nope' })).toThrow();
    expect(() => createOutboundAttempt({ ...input, jobIdempotencyKey: ' ' })).toThrow();
  });
});
