import { describe, it, expect } from 'vitest';
import {
  conversationSessionPreparationRequestSchema,
  conversationSessionPreparationSchema,
  evaluatePreparationValidity,
  mediaTargetSchema,
} from './conversation-session-port.js';

const IDS = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  attemptId: '22222222-2222-4222-8222-222222222222',
  correlationId: '33333333-3333-4333-8333-333333333333',
  agentVersionId: '44444444-4444-4444-8444-444444444444',
};

describe('MediaTarget (SIP first, bidirectional stream as alternative)', () => {
  it('accepts a SIP URI and a wss stream URL', () => {
    expect(
      mediaTargetSchema.parse({ kind: 'SIP_URI', uri: 'sip:session-1@media.example.test' }).kind,
    ).toBe('SIP_URI');
    expect(
      mediaTargetSchema.parse({ kind: 'SIP_URI', uri: 'sips:abc@media.example.test;transport=tls' })
        .kind,
    ).toBe('SIP_URI');
    expect(
      mediaTargetSchema.parse({
        kind: 'BIDIRECTIONAL_AUDIO_STREAM',
        url: 'wss://media.example.test/s/1',
      }).kind,
    ).toBe('BIDIRECTIONAL_AUDIO_STREAM');
  });

  it('rejects malformed targets, plain ws/http streams and extra fields', () => {
    const invalid = [
      { kind: 'SIP_URI', uri: 'http://media.example.test' },
      { kind: 'SIP_URI', uri: 'sip:no-host' },
      { kind: 'SIP_URI', uri: 'sip:a b@c' },
      { kind: 'BIDIRECTIONAL_AUDIO_STREAM', url: 'ws://media.example.test' },
      { kind: 'BIDIRECTIONAL_AUDIO_STREAM', url: 'https://media.example.test' },
      { kind: 'SIP_URI', uri: 'sip:a@b.test', provider: 'x' },
      { kind: 'PSTN', number: '+5511999990000' },
    ];
    for (const value of invalid) expect(mediaTargetSchema.safeParse(value).success).toBe(false);
  });
});

describe('Conversation session preparation', () => {
  it('requires exactly the neutral identifiers (no vendor or contact data)', () => {
    expect(conversationSessionPreparationRequestSchema.parse(IDS)).toEqual(IDS);
    expect(
      conversationSessionPreparationRequestSchema.safeParse({ ...IDS, phone: '+5511999990000' })
        .success,
    ).toBe(false);
    expect(
      conversationSessionPreparationRequestSchema.safeParse({ ...IDS, attemptId: 'x' }).success,
    ).toBe(false);
  });

  it('models PREPARED with unknown validity and UNAVAILABLE reasons strictly', () => {
    const prepared = conversationSessionPreparationSchema.parse({
      kind: 'PREPARED',
      sessionRef: 'opaque-ref',
      mediaTarget: { kind: 'SIP_URI', uri: 'sip:opaque@media.example.test' },
      expiresAt: null,
    });
    expect(prepared.kind).toBe('PREPARED');
    expect(
      conversationSessionPreparationSchema.parse({ kind: 'UNAVAILABLE', reason: 'TIMEOUT' }).kind,
    ).toBe('UNAVAILABLE');
    expect(
      conversationSessionPreparationSchema.safeParse({ kind: 'UNAVAILABLE', reason: 'OOPS' })
        .success,
    ).toBe(false);
    expect(
      conversationSessionPreparationSchema.safeParse({ kind: 'PREPARED', sessionRef: '' }).success,
    ).toBe(false);
  });

  it('never treats unknown validity as valid', () => {
    const base = {
      kind: 'PREPARED' as const,
      sessionRef: 'ref',
      mediaTarget: { kind: 'SIP_URI' as const, uri: 'sip:ref@media.example.test' },
    };
    const now = new Date('2026-11-04T12:00:00.000Z');
    expect(evaluatePreparationValidity({ ...base, expiresAt: null }, now)).toBe('UNKNOWN');
    expect(
      evaluatePreparationValidity({ ...base, expiresAt: '2026-11-04T12:00:30.000Z' }, now),
    ).toBe('VALID');
    expect(
      evaluatePreparationValidity({ ...base, expiresAt: '2026-11-04T12:00:00.000Z' }, now),
    ).toBe('EXPIRED');
  });
});
