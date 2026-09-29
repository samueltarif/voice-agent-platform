import { describe, expect, it } from 'vitest';
import { resolveTwilioCanonicalUrl } from './twilio-canonical-url-resolver.js';

describe('Twilio Canonical URL Resolver', () => {
  const publicBaseUrl = 'https://voice.example.com';

  it('resolves canonical URL with simple path', () => {
    const url = resolveTwilioCanonicalUrl({
      publicBaseUrl,
      requestPath: '/v1/twilio/voice/webhook',
    });
    expect(url).toBe('https://voice.example.com/v1/twilio/voice/webhook');
  });

  it('normalizes missing leading slash in path', () => {
    const url = resolveTwilioCanonicalUrl({
      publicBaseUrl,
      requestPath: 'v1/twilio/voice/webhook',
    });
    expect(url).toBe('https://voice.example.com/v1/twilio/voice/webhook');
  });

  it('appends and sorts query parameters lexicographically', () => {
    const url = resolveTwilioCanonicalUrl({
      publicBaseUrl,
      requestPath: '/webhook',
      query: {
        z_param: 'last',
        a_param: 'first',
        m_param: 'middle',
      },
    });
    expect(url).toBe('https://voice.example.com/webhook?a_param=first&m_param=middle&z_param=last');
  });

  it('handles multi-value query parameters predictably', () => {
    const url = resolveTwilioCanonicalUrl({
      publicBaseUrl,
      requestPath: '/webhook',
      query: {
        tag: ['alpha', 'beta'],
      },
    });
    expect(url).toBe('https://voice.example.com/webhook?tag=alpha&tag=beta');
  });

  it('ignores forged Host, X-Forwarded-Host, and X-Forwarded-Proto headers', () => {
    // Untrusted incoming request headers from the network
    const forgedHeaders = {
      host: 'attacker.evil.com',
      'x-forwarded-host': 'phishing.fake.net',
      'x-forwarded-proto': 'http',
    };

    // The resolver only derives from configured publicBaseUrl, discarding forged headers
    const url = resolveTwilioCanonicalUrl({
      publicBaseUrl,
      requestPath: '/v1/twilio/voice/webhook',
      query: { bootstrapId: '00000000-0000-0000-0000-000000000001' },
    });

    expect(url).toBe(
      'https://voice.example.com/v1/twilio/voice/webhook?bootstrapId=00000000-0000-0000-0000-000000000001',
    );
    expect(url).not.toContain(forgedHeaders.host);
    expect(url).not.toContain(forgedHeaders['x-forwarded-host']);
    expect(url.startsWith('https://')).toBe(true);
  });
});
