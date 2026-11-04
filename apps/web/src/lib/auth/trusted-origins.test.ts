import { describe, it, expect } from 'vitest';
import { isLoopbackOrigin, resolveTrustedOrigins } from './trusted-origins.js';

describe('resolveTrustedOrigins', () => {
  it('trusts the loopback request origin on any port outside production', () => {
    for (const origin of ['http://localhost:3001', 'http://127.0.0.1:3005', 'http://[::1]:3002']) {
      expect(
        resolveTrustedOrigins({ requestOrigin: origin, nodeEnv: 'development', explicitList: '' }),
      ).toEqual([origin]);
    }
  });

  it('never infers origins in production (only the explicit list)', () => {
    expect(
      resolveTrustedOrigins({
        requestOrigin: 'http://localhost:3001',
        nodeEnv: 'production',
        explicitList: undefined,
      }),
    ).toEqual([]);
    expect(
      resolveTrustedOrigins({
        requestOrigin: 'https://evil.example',
        nodeEnv: 'production',
        explicitList: 'https://app.example.com, https://admin.example.com/path',
      }),
    ).toEqual(['https://app.example.com', 'https://admin.example.com']);
  });

  it('rejects non-loopback and look-alike hosts even in development', () => {
    for (const origin of [
      'http://localhost.evil.example:3001',
      'http://evil.example',
      'http://127.0.0.1.nip.io:3000',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(
        resolveTrustedOrigins({ requestOrigin: origin, nodeEnv: 'development', explicitList: '' }),
      ).toEqual([]);
    }
    expect(isLoopbackOrigin('http://localhost.evil.example')).toBe(false);
  });

  it('ignores invalid entries in the explicit list and removes duplicates', () => {
    expect(
      resolveTrustedOrigins({
        requestOrigin: 'http://localhost:3000',
        nodeEnv: 'test',
        explicitList: 'http://localhost:3000, ftp://x.example, , lixo',
      }),
    ).toEqual(['http://localhost:3000']);
  });
});
