import { generateKeyPairSync } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { InternalApiClient } from './internal-api-client.js';
import { UnsafeInternalApiPathError } from './internal-api-path.js';
import { assertSafeInternalApiPath, buildInternalApiUrl } from './internal-api-url.js';

const BASE = 'http://api.internal:3001';
const UUID = '11111111-1111-4111-8111-111111111111';

const HOSTILE_PATHS = [
  '/v1/agents/../organizations',
  '/v1/agents/./x',
  '/v1/agents/%2e%2e/organizations',
  '/v1/agents/%2E%2E/organizations',
  '/v1/agents/.%2e/organizations',
  '/v1/agents/%252e%252e/x',
  '/v1/agents/a%2Fb',
  '/v1/agents/a%5Cb',
  '/v1/agents/a\\b',
  '/v1//agents',
  '//evil.example/v1',
  '/v1/agents/x#frag',
  '/v1/agents/%zz',
  '/v1/agents/%',
  '/v1/agents/a b',
  'http://evil.example/v1',
];

describe('internal API URL guard (F1)', () => {
  it('returns exactly the previous URL for safe paths, queries and encoded segments', () => {
    for (const path of [
      `/v1/agents/${UUID}/versions`,
      '/v1/operations/attempts?days=30&limit=51',
      '/v1/contact-suppressions?limit=100',
      `/v1/me/organizations/${encodeURIComponent('qualitec')}`,
      '/v1/knowledge/documents/a%40b',
    ]) {
      expect(buildInternalApiUrl(BASE, path)).toBe(`${BASE}${path}`);
    }
    expect(buildInternalApiUrl(BASE, 'v1/agents')).toBe(`${BASE}/v1/agents`);
    expect(buildInternalApiUrl('http://api.internal:3001/base', '/v1/agents')).toBe(
      'http://api.internal:3001/base/v1/agents',
    );
  });

  it('refuses dot-segments, encoded separators, double encoding, empty segments and fragments', () => {
    for (const path of HOSTILE_PATHS) {
      expect(() => buildInternalApiUrl(BASE, path), path).toThrow(UnsafeInternalApiPathError);
    }
  });

  it('never lets a path change origin, host or endpoint', () => {
    for (const path of [
      '//evil.example',
      '/\\evil.example',
      '/v1/agents/..%2f..%2fx',
      '/@evil.example',
    ]) {
      try {
        const url = new URL(buildInternalApiUrl(BASE, path));
        expect(url.origin).toBe(BASE);
        expect(url.pathname).toBe(path);
      } catch (error) {
        expect(error).toBeInstanceOf(UnsafeInternalApiPathError);
      }
    }
  });

  it('refuses paths the URL parser would silently rewrite (second barrier)', () => {
    for (const path of ['/v1/agents/é', '/v1/agents/a"b', '/v1/agents/a<b>', '/v1/agents/a`b']) {
      expect(() => assertSafeInternalApiPath(path), path).not.toThrow();
      expect(() => buildInternalApiUrl(BASE, path), path).toThrow(UnsafeInternalApiPathError);
    }
  });
});

/** Todos os chamadores atuais em apps/web: cada `path:` com ids de exemplo. */
function collectCallerPaths(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collectCallerPaths(full, found);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      const source = readFileSync(full, 'utf8');
      for (const match of source.matchAll(/path:\s*(?:internalApiPath)?(['`])(\/v1[^'`]*)\1/g)) {
        found.push(
          match[2]!.replace(/\$\{[^}]*\}/g, (expr) =>
            expr.includes('query') ? '?limit=10' : UUID,
          ),
        );
      }
    }
  }
  return found;
}

describe('internal API client compatibility and refusal', () => {
  it('every current caller path still passes the guard', () => {
    const paths = collectCallerPaths(resolve(__dirname, '../..'));
    expect(paths.length).toBeGreaterThan(30);
    for (const path of paths) expect(() => assertSafeInternalApiPath(path), path).not.toThrow();
  });

  it('does not call the API for an unsafe path and calls it unchanged for a safe one', async () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = new InternalApiClient({
      baseUrl: BASE,
      privateJwk: privateKey.export({ format: 'jwk' }),
      kid: 'test-kid',
      fetchFn,
    });
    const base = { method: 'GET' as const, userId: 'u1', organizationId: 'o1' };
    await expect(
      client.request({ ...base, path: '/v1/agents/../organizations' }),
    ).rejects.toBeInstanceOf(UnsafeInternalApiPathError);
    expect(fetchFn).not.toHaveBeenCalled();
    await client.request({ ...base, path: `/v1/agents/${UUID}` });
    expect(fetchFn).toHaveBeenCalledWith(`${BASE}/v1/agents/${UUID}`, expect.anything());
  });
});
