import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { isSameOriginRequest } from './is-same-origin-request.js';

describe('isSameOriginRequest', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Legitimate same-origin requests', () => {
    it('accepts direct request matching host header', () => {
      const req = new NextRequest('http://localhost:3000/api/agents', {
        headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
      });
      expect(isSameOriginRequest(req)).toBe(true);
    });

    it('accepts https direct request matching host header', () => {
      const req = new NextRequest('https://app.example.com/api/agents', {
        headers: { host: 'app.example.com', origin: 'https://app.example.com' },
      });
      expect(isSameOriginRequest(req)).toBe(true);
    });
  });

  describe('Cross-origin rejection', () => {
    it('rejects cross-origin request with mismatched host', () => {
      const req = new NextRequest('http://localhost:3000/api/agents', {
        headers: { host: 'localhost:3000', origin: 'http://attacker.com' },
      });
      expect(isSameOriginRequest(req)).toBe(false);
    });

    it('rejects request with sec-fetch-site cross-site even if origin is present', () => {
      const req = new NextRequest('http://localhost:3000/api/agents', {
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'sec-fetch-site': 'cross-site',
        },
      });
      expect(isSameOriginRequest(req)).toBe(false);
    });
  });

  describe('Spoofed forwarded-host protection (Fail-Closed)', () => {
    it('rejects spoofed x-forwarded-host matching attacker origin', () => {
      const req = new NextRequest('http://localhost:3000/api/agents', {
        headers: {
          host: 'localhost:3000',
          origin: 'http://attacker.com',
          'x-forwarded-host': 'attacker.com',
        },
      });
      expect(isSameOriginRequest(req)).toBe(false);
    });

    it('rejects spoofed x-forwarded-host matching trusted host when origin is attacker', () => {
      const req = new NextRequest('http://localhost:3000/api/agents', {
        headers: {
          host: 'localhost:3000',
          origin: 'http://attacker.com',
          'x-forwarded-host': 'localhost:3000',
        },
      });
      expect(isSameOriginRequest(req)).toBe(false);
    });

    it('accepts x-forwarded-host when configured in trusted hosts and matching origin', () => {
      process.env.TRUSTED_HOSTS = 'proxy.trusted.com';
      const req = new NextRequest('http://internal-cluster:3000/api/agents', {
        headers: {
          host: 'internal-cluster:3000',
          origin: 'https://proxy.trusted.com',
          'x-forwarded-host': 'proxy.trusted.com',
        },
      });
      expect(isSameOriginRequest(req)).toBe(true);
    });

    it('accepts x-forwarded-host when matching BETTER_AUTH_URL', () => {
      process.env.BETTER_AUTH_URL = 'https://auth.company.com';
      const req = new NextRequest('http://internal:3000/api/agents', {
        headers: {
          host: 'internal:3000',
          origin: 'https://auth.company.com',
          'x-forwarded-host': 'auth.company.com',
        },
      });
      expect(isSameOriginRequest(req)).toBe(true);
    });

    it('handles comma-separated x-forwarded-host using client host if trusted', () => {
      process.env.TRUSTED_HOSTS = 'client.example.com';
      const req = new NextRequest('http://internal:3000/api/agents', {
        headers: {
          host: 'internal:3000',
          origin: 'https://client.example.com',
          'x-forwarded-host': 'client.example.com, intermediate-proxy',
        },
      });
      expect(isSameOriginRequest(req)).toBe(true);
    });
  });

  describe('Malformed Origin and protocol handling', () => {
    it('rejects malformed origin string', () => {
      const req = new NextRequest('http://localhost:3000/api/agents', {
        headers: { host: 'localhost:3000', origin: 'not-a-valid-url' },
      });
      expect(isSameOriginRequest(req)).toBe(false);
    });

    it('rejects non-http/https protocol origin', () => {
      const req = new NextRequest('http://localhost:3000/api/agents', {
        headers: { host: 'localhost:3000', origin: 'javascript:alert(1)' },
      });
      expect(isSameOriginRequest(req)).toBe(false);
    });
  });

  describe('Missing Origin behavior', () => {
    it('accepts request without origin when sec-fetch-site is same-origin', () => {
      const req = new NextRequest('http://localhost:3000/api/agents', {
        headers: { host: 'localhost:3000', 'sec-fetch-site': 'same-origin' },
      });
      expect(isSameOriginRequest(req)).toBe(true);
    });

    it('accepts request without origin when sec-fetch-site is missing', () => {
      const req = new NextRequest('http://localhost:3000/api/agents', {
        headers: { host: 'localhost:3000' },
      });
      expect(isSameOriginRequest(req)).toBe(true);
    });

    it('rejects request without origin when sec-fetch-site is cross-site', () => {
      const req = new NextRequest('http://localhost:3000/api/agents', {
        headers: { host: 'localhost:3000', 'sec-fetch-site': 'cross-site' },
      });
      expect(isSameOriginRequest(req)).toBe(false);
    });
  });
});
