import { describe, expect, it } from 'vitest';
import { TwiMLGenerationError } from '@voice-agent/errors';
import { escapeXml, generateConversationRelayTwiML } from './twilio-twiml-generator.js';

describe('Twilio ConversationRelay TwiML Generator', () => {
  it('generates minimal valid ConversationRelay TwiML', () => {
    const xml = generateConversationRelayTwiML({
      websocketUrl: 'wss://voice.example.com/v1/twilio/conversation-relay',
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<Response>');
    expect(xml).toContain('<Connect>');
    expect(xml).toContain(
      '<ConversationRelay url="wss://voice.example.com/v1/twilio/conversation-relay"></ConversationRelay>',
    );
    expect(xml).toContain('</Connect>');
    expect(xml).toContain('</Response>');
  });

  it('generates ConversationRelay with Parameter elements', () => {
    const xml = generateConversationRelayTwiML({
      websocketUrl: 'wss://voice.example.com/ws',
      parameters: [{ name: 'bootstrapId', value: '00000000-0000-0000-0000-000000000001' }],
    });

    expect(xml).toContain('<ConversationRelay url="wss://voice.example.com/ws">');
    expect(xml).toContain(
      '<Parameter name="bootstrapId" value="00000000-0000-0000-0000-000000000001" />',
    );
  });

  it('includes connectActionUrl when provided', () => {
    const xml = generateConversationRelayTwiML({
      websocketUrl: 'wss://voice.example.com/ws',
      connectActionUrl: 'https://voice.example.com/call-ended',
    });

    expect(xml).toContain('<Connect action="https://voice.example.com/call-ended">');
  });

  it('safely escapes XML special characters to prevent XML injection', () => {
    const maliciousValue = 'foo"&<>\'bar';
    const escaped = escapeXml(maliciousValue);
    expect(escaped).toBe('foo&quot;&amp;&lt;&gt;&apos;bar');

    const xml = generateConversationRelayTwiML({
      websocketUrl: 'wss://voice.example.com/ws?tag=a&b',
      parameters: [
        {
          name: 'param<Test>',
          value: 'val"&inject<script>',
        },
      ],
      connectActionUrl: 'https://voice.example.com/action?x=1&y=2',
    });

    expect(xml).toContain('wss://voice.example.com/ws?tag=a&amp;b');
    expect(xml).toContain('action="https://voice.example.com/action?x=1&amp;y=2"');
    expect(xml).toContain('name="param&lt;Test&gt;"');
    expect(xml).toContain('value="val&quot;&amp;inject&lt;script&gt;"');
    expect(xml).not.toContain('<script>');
  });

  it('rejects invalid or non-websocket URLs with TwiMLGenerationError', () => {
    expect(() => generateConversationRelayTwiML({ websocketUrl: '' })).toThrow(
      TwiMLGenerationError,
    );
    expect(() =>
      generateConversationRelayTwiML({
        websocketUrl: 'https://voice.example.com/not-ws',
      }),
    ).toThrow(TwiMLGenerationError);
  });
});
