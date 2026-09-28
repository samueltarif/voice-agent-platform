import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InvalidProviderMessageError } from '@voice-agent/errors';
import {
  parseTwilioInboundMessage,
  translateEndCallCommand,
  translateSpeakCommand,
  translateTwilioInboundEvent,
  validateTwilioSignature,
} from './index.js';

describe('Twilio ConversationRelay Golden Fixtures & Protocol Fidelity', () => {
  const context = {
    organizationId: '11111111-1111-1111-1111-111111111111',
    callId: '00000000-0000-0000-0000-000000000001',
    now: () => new Date('2026-09-28T12:00:00.000Z'),
    turnIdGenerator: () => 'golden_turn_1',
  };

  it('accepts official Twilio setup message fixture', () => {
    const goldenSetup = {
      type: 'setup',
      sessionId: 'CR_mock_session_12345',
      callSid: 'CA_mock_call_67890',
      parentCallSid: 'CA_mock_parent_11111',
      from: '+5511999999999',
      to: '+5511888888888',
      customParameters: {
        agentVersion: '1.0.0',
        environment: 'staging',
      },
    };

    const parsed = parseTwilioInboundMessage(goldenSetup);
    expect(parsed.type).toBe('setup');
    const event = translateTwilioInboundEvent(parsed, context);
    expect(event?.type).toBe('transport.connected');
    expect(event?.callId).toBe(context.callId);
    expect(event?.organizationId).toBe(context.organizationId);
  });

  it('accepts official Twilio prompt message fixture', () => {
    const goldenPrompt = {
      type: 'prompt',
      voicePrompt: 'Olá, gostaria de consultar a segunda via do meu boleto.',
      lang: 'pt-BR',
      confidence: 0.96,
      last: true,
    };

    const parsed = parseTwilioInboundMessage(goldenPrompt);
    expect(parsed.type).toBe('prompt');
    const event = translateTwilioInboundEvent(parsed, context);
    expect(event?.type).toBe('user.speech.final');
    if (event?.type === 'user.speech.final') {
      expect(event.transcript).toBe(goldenPrompt.voicePrompt);
      expect(event.turnId).toBe('golden_turn_1');
    }
  });

  it('accepts official Twilio interrupt message fixture', () => {
    const goldenInterrupt = {
      type: 'interrupt',
      utteranceUntilInterrupt: 'Não, prefiro falar sobre cancelamento',
      durationUntilInterruptMs: 1450,
    };

    const parsed = parseTwilioInboundMessage(goldenInterrupt);
    expect(parsed.type).toBe('interrupt');
    const event = translateTwilioInboundEvent(parsed, context);
    expect(event?.type).toBe('user.interruption');
  });

  it('produces official Twilio text token outbound message shape', () => {
    const textMessage = translateSpeakCommand({
      type: 'speak',
      callId: context.callId,
      text: 'Entendido. Um momento enquanto verifico suas faturas.',
      generationId: 'gen_golden_1',
      isFinal: false,
    });

    expect(textMessage).toEqual({
      type: 'text',
      token: 'Entendido. Um momento enquanto verifico suas faturas.',
      last: false,
    });
  });

  it('produces official Twilio end outbound message with handoffData', () => {
    const endMessage = translateEndCallCommand({
      type: 'end_call',
      callId: context.callId,
      reason: 'call_completed_normal',
    });

    expect(endMessage.type).toBe('end');
    expect(endMessage.handoffData).toBe('{"reason":"call_completed_normal"}');
  });

  it('hardened parser rejects non-object, missing type, and invalid structure', () => {
    expect(() => parseTwilioInboundMessage(12345)).toThrow(InvalidProviderMessageError);
    expect(() => parseTwilioInboundMessage([])).toThrow(InvalidProviderMessageError);
    expect(() => parseTwilioInboundMessage({ foo: 'bar' })).toThrow(InvalidProviderMessageError);
    expect(() => parseTwilioInboundMessage({ type: 'setup', sessionId: 123 })).toThrow(
      InvalidProviderMessageError,
    );
  });

  it('validates signature calculation against known deterministic HMAC-SHA1 vector', () => {
    const testSecret = '12345';
    const testUrl = 'https://mycompany.com/myapp.php?foo=1&bar=2';
    const testParams = {
      CallSid: 'CA1234567890ABCDE',
      Caller: '+14158675310',
      Digits: '1234',
      From: '+14158675310',
      To: '+18005551212',
    };

    // Canonical representation: URL + sorted key-values
    const expectedPayload = `${testUrl}CallSidCA1234567890ABCDECaller+14158675310Digits1234From+14158675310To+18005551212`;
    const computedSignature = createHmac('sha1', testSecret)
      .update(expectedPayload, 'utf8')
      .digest('base64');

    expect(
      validateTwilioSignature({
        url: testUrl,
        params: testParams,
        signature: computedSignature,
        authToken: testSecret,
      }),
    ).toBe(true);

    // Mismatched length safe reject
    expect(
      validateTwilioSignature({
        url: testUrl,
        params: testParams,
        signature: 'short',
        authToken: testSecret,
      }),
    ).toBe(false);
  });
});
