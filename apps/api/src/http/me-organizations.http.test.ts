import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { createApp } from '../app.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import { BootstrapAssertionVerifier } from '../auth/bootstrap-assertion-verifier.js';
import { createNullLogger } from '@voice-agent/logger';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import type { UserOrganizationContextRepository } from '@voice-agent/database';

describe('HTTP /v1/me/organizations & Cross-Profile Isolation', () => {
  let app: ReturnType<typeof createApp>;
  let privateJwk: JWK;
  const kid = 'me-test-key-1';
  const userId = 'usr_test_bootstrap_1';
  const orgId = '11111111-1111-1111-1111-111111111111';

  interface MockOrgItem {
    id: string;
    slug: string;
    name: string;
    role: 'OWNER';
  }

  const mockOrgs: MockOrgItem[] = [
    {
      id: orgId,
      slug: 'acme-corp',
      name: 'Acme Corp',
      role: 'OWNER',
    },
  ];

  let repoListResult: MockOrgItem[] = [...mockOrgs];
  let repoSlugResult: MockOrgItem | null = { ...mockOrgs[0]! };

  beforeAll(async () => {
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = await exportJWK(keyPair.privateKey);
    const publicJwk = await exportJWK(keyPair.publicKey);
    privateJwk.kid = kid;
    publicJwk.kid = kid;

    const publicJwks = { keys: [publicJwk] };
    const verifier = new ServiceAssertionVerifier({ publicJwks });
    const bootstrapVerifier = new BootstrapAssertionVerifier({ publicJwks });

    const mockUserOrgContextRepo = {
      listActiveOrganizationsForUser: async (uid: string) => {
        if (uid === userId) return repoListResult;
        return [];
      },
      findActiveOrganizationBySlugForUser: async (params: { userId: string; slug: string }) => {
        if (params.userId === userId && repoSlugResult?.slug === params.slug) return repoSlugResult;
        return null;
      },
    } as unknown as UserOrganizationContextRepository;

    const dummyDeps: ApiDependencies = {
      logger: createNullLogger(),
      verifier,
      bootstrapVerifier,
      agentRepo: {
        listAgentsByOrganization: async () => [],
      } as unknown as ApiDependencies['agentRepo'],
      versionRepo: {} as ApiDependencies['versionRepo'],
      lifecycleService: {} as ApiDependencies['lifecycleService'],
      draftService: {} as ApiDependencies['draftService'],
      discardService: {} as ApiDependencies['discardService'],
      publicationService: {} as ApiDependencies['publicationService'],
      membershipRepo: {
        findMembership: async () => ({
          organizationId: orgId,
          userId,
          role: 'ADMIN',
          status: 'ACTIVE',
        }),
      } as unknown as ApiDependencies['membershipRepo'],
      organizationRepo: {
        findOrganizationById: async () => ({ id: orgId, status: 'ACTIVE' }),
      } as unknown as ApiDependencies['organizationRepo'],
      userOrgContextRepo: mockUserOrgContextRepo,
    };

    app = createApp(dummyDeps);
  });

  async function createBootstrapToken(claims: Record<string, unknown> = {}): Promise<string> {
    const { importJWK } = await import('jose');
    const key = await importJWK(privateJwk, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      sub: userId,
      scope: 'user:bootstrap',
      iss: 'voice-agent:web',
      aud: 'voice-agent:api:bootstrap',
      iat: now,
      exp: now + 30,
      jti: '11111111-1111-4111-8111-111111111111',
      ...claims,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .sign(key);
  }

  async function createTenantToken(claims: Record<string, unknown> = {}): Promise<string> {
    const { importJWK } = await import('jose');
    const key = await importJWK(privateJwk, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      sub: userId,
      orgId,
      iss: 'voice-agent:web',
      aud: 'voice-agent:api',
      iat: now,
      exp: now + 30,
      jti: '22222222-2222-4222-8222-222222222222',
      ...claims,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .sign(key);
  }

  it('1. GET /v1/me/organizations returns 200 with active organizations', async () => {
    repoListResult = [...mockOrgs];
    const token = await createBootstrapToken();
    const res = await app.request('/v1/me/organizations', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof mockOrgs;
    expect(body).toEqual(mockOrgs);
    expect(body[0]).toHaveProperty('id');
    expect(body[0]).toHaveProperty('slug');
    expect(body[0]).toHaveProperty('name');
    expect(body[0]).toHaveProperty('role');
    // Ensure no leaked fields
    expect(Object.keys(body[0]!).sort()).toEqual(['id', 'name', 'role', 'slug']);
  });

  it('2. GET /v1/me/organizations returns 200 with empty array when user has no active orgs', async () => {
    repoListResult = [];
    const token = await createBootstrapToken();
    const res = await app.request('/v1/me/organizations', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('3. GET /v1/me/organizations/:orgSlug returns 200 when found and active', async () => {
    repoSlugResult = { ...mockOrgs[0]! };
    const token = await createBootstrapToken();
    const res = await app.request('/v1/me/organizations/acme-corp', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as (typeof mockOrgs)[0];
    expect(body).toEqual(mockOrgs[0]);
    expect(Object.keys(body).sort()).toEqual(['id', 'name', 'role', 'slug']);
  });

  it('4. GET /v1/me/organizations/:orgSlug returns 404 when not found or inaccessible', async () => {
    repoSlugResult = null;
    const token = await createBootstrapToken();
    const res = await app.request('/v1/me/organizations/non-existent', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('5. Cross-Profile: bootstrap token rejected on /v1/agents with 401', async () => {
    const token = await createBootstrapToken();
    const res = await app.request('/v1/agents', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('6. Cross-Profile: tenant token rejected on /v1/me/organizations with 401', async () => {
    const token = await createTenantToken();
    const res = await app.request('/v1/me/organizations', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('7. Cross-Profile: tenant token rejected on /v1/me/organizations/:slug with 401', async () => {
    const token = await createTenantToken();
    const res = await app.request('/v1/me/organizations/acme-corp', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('8. Bootstrap token with forbidden orgId rejected on /v1/me/organizations with 401', async () => {
    const token = await createBootstrapToken({ orgId });
    const res = await app.request('/v1/me/organizations', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('9. Missing Authorization header returns 401', async () => {
    const res = await app.request('/v1/me/organizations', {
      method: 'GET',
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('AUTHENTICATION_ERROR');
  });
});
