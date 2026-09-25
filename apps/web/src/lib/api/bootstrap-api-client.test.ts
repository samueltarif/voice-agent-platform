import { describe, it, expect, vi } from 'vitest';
import { generateKeyPair, exportJWK, decodeProtectedHeader, decodeJwt } from 'jose';
import { BootstrapApiClient } from './bootstrap-api-client.js';
import type { OrganizationContextResponse } from '@voice-agent/contracts';

describe('BootstrapApiClient', () => {
  it('calls /v1/me/organizations with signed bootstrap assertion', async () => {
    const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const privateJwk = await exportJWK(privateKey);
    privateJwk.kid = 'web-test-key';

    const mockOrgs: OrganizationContextResponse[] = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        slug: 'acme-corp',
        name: 'Acme Corp',
        role: 'OWNER',
      },
    ];

    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = init.headers as Record<string, string>;
      return new Response(JSON.stringify(mockOrgs), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new BootstrapApiClient({
      baseUrl: 'http://localhost:3001',
      privateJwk,
      kid: 'web-test-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await client.listOrganizationsForUser('user-123', 'custom-req-id');

    expect(result).toEqual(mockOrgs);
    expect(capturedUrl).toBe('http://localhost:3001/v1/me/organizations');
    expect(capturedHeaders['x-request-id']).toBe('custom-req-id');
    expect(capturedHeaders.Accept).toBe('application/json');

    // Verify token headers & claims
    const authHeader = capturedHeaders.Authorization ?? '';
    const token = authHeader.replace('Bearer ', '');
    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe('EdDSA');
    expect(header.typ).toBe('JWT');

    const payload = decodeJwt(token);
    expect(payload.sub).toBe('user-123');
    expect(payload.scope).toBe('user:bootstrap');
    expect(payload.aud).toBe('voice-agent:api:bootstrap');
    expect(payload.iss).toBe('voice-agent:web');
  });

  it('calls /v1/me/organizations/:orgSlug and handles not found error', async () => {
    const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const privateJwk = await exportJWK(privateKey);
    privateJwk.kid = 'web-test-key';

    const mockFetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'NOT_FOUND',
            message: 'Organization not found',
          },
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });

    const client = new BootstrapApiClient({
      baseUrl: 'http://localhost:3001',
      privateJwk,
      kid: 'web-test-key',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(client.getOrganizationBySlug('user-123', 'unknown-org')).rejects.toThrow(
      'Organization not found',
    );
  });
});
