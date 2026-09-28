import { describe, expect, it } from 'vitest';
import { InvalidProviderMessageError } from '@voice-agent/errors';
import {
  translateEndCallCommand,
  translateSpeakCommand,
  translateVoiceOutputCommand,
} from './twilio-command-translator.js';
import { parseTwilioInboundMessage } from './twilio-conversation-relay-types.js';
import { translateTwilioInboundEvent } from './twilio-event-translator.js';

describe('Twilio Event & Command Translators', () => {
  const context = {
    callId: '00000000-0000-0000-0000-000000000001',
    organizationId: '11111111-1111-1111-1111-111111111111',
    now: () => new Date('2026-09-28T12:00:00Z'),
    turnIdGenerator: () => 'test_turn_1',
  };

  describe('Inbound Event Translation', () => {
    it('translates setup message to transport.connected event', () => {
      const parsed = parseTwilioInboundMessage({
        type: 'setup',
        sessionId: 'CR123',
        callSid: 'CA123',
      });
      const event = translateTwilioInboundEvent(parsed, context);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('transport.connected');
      expect(event?.callId).toBe(context.callId);
      expect(event?.organizationId).toBe(context.organizationId);
      expect(event?.timestamp.toISOString()).toBe('2026-09-28T12:00:00.000Z');
    });

    it('translates prompt message to user.speech.final event', () => {
      const parsed = parseTwilioInboundMessage({
        type: 'prompt',
        voicePrompt: 'Preciso de ajuda com meu pedido.',
      });
      const event = translateTwilioInboundEvent(parsed, context);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('user.speech.final');
      if (event?.type === 'user.speech.final') {
        expect(event.transcript).toBe('Preciso de ajuda com meu pedido.');
        expect(event.turnId).toBe('test_turn_1');
      }
    });

    it('translates interrupt message to user.interruption event', () => {
      const parsed = parseTwilioInboundMessage({
        type: 'interrupt',
        utteranceUntilInterrupt: 'Espere um pouco...',
      });
      const event = translateTwilioInboundEvent(parsed, context);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('user.interruption');
      if (event?.type === 'user.interruption') {
        expect(event.turnId).toBe('test_turn_1');
      }
    });

    it('translates disconnect message to transport.disconnected event', () => {
      const parsed = parseTwilioInboundMessage({
        type: 'disconnect',
        reason: 'caller_hangup',
      });
      const event = translateTwilioInboundEvent(parsed, context);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('transport.disconnected');
      if (event?.type === 'transport.disconnected') {
        expect(event.reason).toBe('caller_hangup');
      }
    });

    it('translates error message to provider.failure event', () => {
      const parsed = parseTwilioInboundMessage({
        type: 'error',
        code: 64107,
        description: 'TTS synthesis error',
      });
      const event = translateTwilioInboundEvent(parsed, context);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('provider.failure');
      if (event?.type === 'provider.failure') {
        expect(event.error).toBe('TTS synthesis error');
      }
    });

    it('returns null for unknown provider event without throwing', () => {
      const parsed = parseTwilioInboundMessage({
        type: 'custom_telephony_ping',
      });
      expect(parsed.type).toBe('unknown');
      const event = translateTwilioInboundEvent(parsed, context);
      expect(event).toBeNull();
    });

    it('rejects malformed payloads with InvalidProviderMessageError', () => {
      expect(() => parseTwilioInboundMessage(null)).toThrow(InvalidProviderMessageError);
      expect(() => parseTwilioInboundMessage('not an object')).toThrow(InvalidProviderMessageError);
      expect(() => parseTwilioInboundMessage({})).toThrow(InvalidProviderMessageError);
      expect(() => parseTwilioInboundMessage({ type: 'setup' })).toThrow(
        InvalidProviderMessageError,
      );
      expect(() => parseTwilioInboundMessage({ type: 'prompt' })).toThrow(
        InvalidProviderMessageError,
      );
    });
  });

  describe('Outbound Command Translation', () => {
    it('translates SpeakCommand to text message with token and last flag', () => {
      const message = translateSpeakCommand({
        type: 'speak',
        callId: context.callId,
        text: 'Olá, como posso ajudar?',
        generationId: 'gen_1',
        isFinal: false,
      });

      expect(message).toEqual({
        type: 'text',
        token: 'Olá, como posso ajudar?',
        last: false,
      });
    });

    it('translates EndCallCommand to end message with stringified handoffData', () => {
      const message = translateEndCallCommand({
        type: 'end_call',
        callId: context.callId,
        reason: 'completed_satisfactorily',
      });

      expect(message.type).toBe('end');
      expect(message.handoffData).toBe('{"reason":"completed_satisfactorily"}');
    });

    it('translates generic VoiceOutputCommand correctly', () => {
      const speak = translateVoiceOutputCommand({
        type: 'speak',
        callId: context.callId,
        text: 'Tchau!',
        generationId: 'gen_2',
        isFinal: true,
      });
      expect(speak?.type).toBe('text');

      const interrupt = translateVoiceOutputCommand({
        type: 'interrupt_speech',
        callId: context.callId,
      });
      expect(interrupt).toBeNull();
    });
  });
});
