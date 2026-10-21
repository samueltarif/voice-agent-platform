import { describe, expect, it } from 'vitest';
import {
  classifyPostgresFailure,
  OutboundPersistenceTechnicalError,
} from './outbound-persistence-errors.js';
import { extractEventAttributes, fingerprintAttemptEvent } from './call-event-store.js';
import { parseRegisterPhoneNumberInput } from './organization-phone-number-types.js';

const base = {
  eventId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  attemptId: '33333333-3333-4333-8333-333333333333',
  jobId: '44444444-4444-4444-8444-444444444444',
  occurredAt: '2026-10-20T12:00:00.000Z',
} as const;

describe('classifyPostgresFailure (pure)', () => {
  it.each([
    ['23505', 'UNIQUE_VIOLATION'],
    ['23503', 'FOREIGN_KEY_VIOLATION'],
    ['23514', 'CHECK_VIOLATION'],
    ['P0001', 'INVARIANT_GUARD'],
    ['40001', 'SERIALIZATION_CONFLICT'],
    ['40P01', 'SERIALIZATION_CONFLICT'],
  ])('maps SQLSTATE %s (wrapped by the ORM) to %s', (code, kind) => {
    const wrapped = new Error('Failed query', { cause: { code, constraint: 'some_constraint' } });
    expect(classifyPostgresFailure(wrapped)).toEqual({ kind, constraint: 'some_constraint' });
  });

  it('treats connection failures and unknown errors as TECHNICAL (never success/duplicate)', () => {
    expect(
      classifyPostgresFailure(new Error('boom', { cause: { code: 'ECONNREFUSED' } })).kind,
    ).toBe('TECHNICAL');
    expect(classifyPostgresFailure('nope').kind).toBe('TECHNICAL');
  });

  it('technical errors carry no SQL, parameters or tenant data in the message', () => {
    const err = new OutboundPersistenceTechnicalError('claimSend', {
      cause: new Error('secret dsn'),
    });
    expect(err.message).toBe("Outbound persistence operation 'claimSend' failed technically.");
  });
});

describe('event fingerprint and attribute whitelist (pure)', () => {
  it('is deterministic and independent of key order', () => {
    const a = { ...base, type: 'SEND_STARTED' as const, authorityId: 'w-1' };
    const b = { authorityId: 'w-1', type: 'SEND_STARTED' as const, ...base };
    expect(fingerprintAttemptEvent(a)).toBe(fingerprintAttemptEvent(b));
    expect(fingerprintAttemptEvent(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the content changes under the same event id', () => {
    const a = { ...base, type: 'SEND_STARTED' as const, authorityId: 'w-1' };
    expect(fingerprintAttemptEvent(a)).not.toBe(
      fingerprintAttemptEvent({ ...a, authorityId: 'w-2' }),
    );
  });

  it('persists only whitelisted operational attributes', () => {
    const rejected = {
      ...base,
      type: 'ORIGINATION_REJECTED' as const,
      reasonCode: 'PROVIDER_REFUSED' as const,
    };
    expect(extractEventAttributes(rejected)).toEqual({ reasonCode: 'PROVIDER_REFUSED' });
    expect(extractEventAttributes({ ...base, type: 'INTENT_RECORDED' })).toEqual({});
  });
});

describe('phone number registration input (pure)', () => {
  const organizationId = '11111111-1111-4111-8111-111111111111';
  const parse = (input: Record<string, unknown>) =>
    parseRegisterPhoneNumberInput(input as never) !== null;

  it('accepts synthetic E.164 metadata and rejects malformed numbers or unknown fields', () => {
    expect(
      parse({ organizationId, e164Number: '+15555550100', twilioPhoneNumberSid: 'PN-synthetic' }),
    ).toBe(true);
    expect(parse({ organizationId, e164Number: '5555550100' })).toBe(false);
    expect(parse({ organizationId, e164Number: '+15555550100', authToken: 'x' })).toBe(false);
  });
});
