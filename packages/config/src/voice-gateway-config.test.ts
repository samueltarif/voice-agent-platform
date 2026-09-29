import { describe, expect, it } from 'vitest';
import { InvalidCanonicalUrlError } from '@voice-agent/errors';
import {
  createVoiceGatewayConfig,
  deriveWebSocketUrl,
  PROPOSED_DEFAULT_BOOTSTRAP_TTL_MS,
  validatePublicVoiceBaseUrl,
} from './voice-gateway-config.js';

describe('Voice Gateway Configuration & URL Validation', () => {
  it('validates and normalizes valid HTTPS public base URL', () => {
    const normalized = validatePublicVoiceBaseUrl('https://voice.example.com/');
    expect(normalized).toBe('https://voice.example.com');
  });

  it('allows HTTP in non-production environments', () => {
    const normalized = validatePublicVoiceBaseUrl('http://localhost:3000', false);
    expect(normalized).toBe('http://localhost:3000');
  });

  it('rejects HTTP in production mode', () => {
    expect(() => validatePublicVoiceBaseUrl('http://voice.example.com', true)).toThrow(
      InvalidCanonicalUrlError,
    );
  });

  it('rejects URLs containing embedded user credentials', () => {
    expect(() => validatePublicVoiceBaseUrl('https://user:pass@voice.example.com')).toThrow(
      InvalidCanonicalUrlError,
    );
  });

  it('rejects URLs containing fragments', () => {
    expect(() => validatePublicVoiceBaseUrl('https://voice.example.com#section')).toThrow(
      InvalidCanonicalUrlError,
    );
  });

  it('rejects unsupported protocols', () => {
    expect(() => validatePublicVoiceBaseUrl('ftp://voice.example.com')).toThrow(
      InvalidCanonicalUrlError,
    );
  });

  it('rejects malformed URLs', () => {
    expect(() => validatePublicVoiceBaseUrl('not-a-url')).toThrow(InvalidCanonicalUrlError);
  });

  it('derives WSS URL from HTTPS base URL', () => {
    const wsUrl = deriveWebSocketUrl('https://voice.example.com', '/v1/custom/path');
    expect(wsUrl).toBe('wss://voice.example.com/v1/custom/path');
  });

  it('derives WS URL from HTTP base URL', () => {
    const wsUrl = deriveWebSocketUrl('http://localhost:3000');
    expect(wsUrl).toBe('ws://localhost:3000/v1/twilio/conversation-relay');
  });

  it('creates configuration with proposed default TTL and custom TTL', () => {
    const defaultConfig = createVoiceGatewayConfig({
      publicVoiceBaseUrl: 'https://voice.example.com',
    });
    expect(defaultConfig.bootstrapTtlMs).toBe(PROPOSED_DEFAULT_BOOTSTRAP_TTL_MS);
    expect(defaultConfig.conversationRelayPath).toBe('/v1/twilio/conversation-relay');

    const customConfig = createVoiceGatewayConfig({
      publicVoiceBaseUrl: 'https://voice.example.com',
      conversationRelayPath: 'custom/ws',
      bootstrapTtlMs: 30_000,
    });
    expect(customConfig.bootstrapTtlMs).toBe(30_000);
    expect(customConfig.conversationRelayPath).toBe('/custom/ws');
  });
});
