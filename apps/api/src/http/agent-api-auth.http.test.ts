import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { createApp } from '../app.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import { createNullLogger } from '@voice-agent/logger';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import type { OrganizationRepository, MembershipRepository } from '@voice-agent/database';

interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

describe('HTTP /v1 Auth, Request-ID & Validation Contracts', () => {
  let app: ReturnType<typeof createApp>;
  let privateJwk: JWK;
  const kid = 'auth-test-key-1';
  const orgId = '11111111-1111-1111-1111-111111111111';
  const sub = 'user-test-sub-1';

  let mockOrg: { id: string; status: string } | null = { id: orgId, status: 'ACTIVE' };
  let mockMembership: {
    organizationId: string;
    userId: string;
    role: string;
    status: string;
  } | null = {
    organizationId: orgId,
    userId: sub,
    role: 'ADMIN',
    status: 'ACTIVE',
  };

  beforeAll(async () => {
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = await exportJWK(keyPair.privateKey);
    const publicJwk = await exportJWK(keyPair.publicKey);
    privateJwk.kid = kid;
    publicJwk.kid = kid;

    const verifier = new ServiceAssertionVerifier({ publicJwks: { keys: [publicJwk] } });

    const mockOrgRepo = {
      findOrganizationById: async () => mockOrg,
    } as unknown as OrganizationRepository;

    const mockMembershipRepo = {
      findMembership: async () => mockMembership,
    } as unknown as MembershipRepository;

    const dummyDeps = {
      logger: createNullLogger(),
      verifier,
      agentRepo: {
        listAgentsByOrganization: async () => [],
      } as unknown as ApiDependencies['agentRepo'],
      versionRepo: {
        getCurrentPublishedVersion: async () => null,
      } as unknown as ApiDependencies['versionRepo'],
      lifecycleService: {
        createAgent: async () => ({
          id: '1',
          name: 'A',
          slug: 'a',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as unknown as ApiDependencies['lifecycleService'],
      draftService: {} as ApiDependencies['draftService'],
      discardService: {} as ApiDependencies['discardService'],
      publicationService: {} as ApiDependencies['publicationService'],
      membershipRepo: mockMembershipRepo,
      organizationRepo: mockOrgRepo,
    };

    app = createApp(dummyDeps);
  });

  async function createToken(claimsOverrides: Record<string, unknown> = {}): Promise<string> {
    const { importJWK } = await import('jose');
    const key = await importJWK(privateJwk, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      sub,
      orgId,
      iss: 'voice-agent:web',
      aud: 'voice-agent:api',
      iat: now,
      exp: now + 30,
      jti: 'jti-1',
      ...claimsOverrides,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .sign(key);
  }

  it('rejects /v1 requests with 401 when Authorization header is missing', async () => {
    const res = await app.request('/v1/agents');
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('AUTHENTICATION_ERROR');
    expect(body.error.requestId).toBeDefined();
  });

  it('rejects /v1 requests with 401 on malformed or invalid Bearer token', async () => {
    const res = await app.request('/v1/agents', {
      headers: { Authorization: 'Bearer invalid.token.value' },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('rejects /v1 requests with 403 when user is not a member of the organization', async () => {
    mockMembership = null;
    const token = await createToken();
    const res = await app.request('/v1/agents', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('rejects /v1 requests with 403 when membership is not ACTIVE', async () => {
    mockMembership = { organizationId: orgId, userId: sub, role: 'ADMIN', status: 'SUSPENDED' };
    const token = await createToken();
    const res = await app.request('/v1/agents', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('rejects /v1 requests with 403 when organization is not ACTIVE', async () => {
    mockMembership = { organizationId: orgId, userId: sub, role: 'ADMIN', status: 'ACTIVE' };
    mockOrg = { id: orgId, status: 'SUSPENDED' };
    const token = await createToken();
    const res = await app.request('/v1/agents', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('FORBIDDEN');
    mockOrg = { id: orgId, status: 'ACTIVE' };
  });

  it('preserves valid x-request-id and returns it in header and error envelope', async () => {
    mockMembership = { organizationId: orgId, userId: sub, role: 'ADMIN', status: 'ACTIVE' };
    const customReqId = 'req-trace-custom-12345';
    const res = await app.request('/v1/agents', {
      headers: { 'x-request-id': customReqId },
    });
    expect(res.headers.get('x-request-id')).toBe(customReqId);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.requestId).toBe(customReqId);
  });

  it('generates a fresh UUID when x-request-id is missing or invalid', async () => {
    const resMissing = await app.request('/v1/agents');
    const reqId1 = resMissing.headers.get('x-request-id');
    expect(reqId1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    const resTooLong = await app.request('/v1/agents', {
      headers: { 'x-request-id': 'a'.repeat(70) },
    });
    const reqId2 = resTooLong.headers.get('x-request-id');
    expect(reqId2).not.toBe('a'.repeat(70));
    expect(reqId2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('returns canonical 400 VALIDATION_ERROR envelope on invalid or extra body fields', async () => {
    mockMembership = { organizationId: orgId, userId: sub, role: 'ADMIN', status: 'ACTIVE' };
    const token = await createToken();

    // Body with unknown extra fields and injected fields
    const res = await app.request('/v1/agents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Agent X',
        slug: 'agent-x',
        organizationId: 'malicious-org-injection',
        createdBy: 'malicious-user-injection',
        role: 'OWNER',
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('Unrecognized key(s)');
    expect(body.error.message).toContain('organizationId');
    expect(body.error.requestId).toBeDefined();
  });
});
