import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { generateKeyPair, exportJWK, importJWK, SignJWT, type JWK } from 'jose';
import { AppError } from '@voice-agent/errors';
import { createNullLogger } from '@voice-agent/logger';
import type { OrganizationRepository, MembershipRepository } from '@voice-agent/database';
import type {
  KnowledgeRetrievalPreview,
  KnowledgeRetrievalPreviewInput,
  TenantRole,
} from '@voice-agent/contracts';
import { createApp } from '../app.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import { BootstrapAssertionVerifier } from '../auth/bootstrap-assertion-verifier.js';
import type { ApiDependencies } from '../composition/agent-dependencies.js';

/** DEC-055: pré-visualização offline — RBAC, organização da asserção e validação. */
describe('HTTP POST /v1/knowledge/retrieval-preview', () => {
  const kid = 'kb-preview-key';
  const orgId = '11111111-1111-1111-1111-111111111111';
  const otherOrgId = '99999999-9999-9999-9999-999999999999';
  const agentId = '33333333-3333-3333-3333-333333333333';
  const sub = 'user-kb-preview';
  let privateJwk: JWK;
  let app: ReturnType<typeof createApp>;
  let role: TenantRole = 'OWNER';
  let calls: KnowledgeRetrievalPreviewInput[] = [];
  let failWith: AppError | null = null;
  const result: KnowledgeRetrievalPreview = {
    trust: 'UNTRUSTED_DATA',
    mode: 'AGENT',
    agentId,
    terms: ['transmissor', 'pressao'],
    hits: [],
    truncated: false,
  };

  beforeAll(async () => {
    const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = { ...(await exportJWK(pair.privateKey)), kid };
    const publicJwk = { ...(await exportJWK(pair.publicKey)), kid };
    const deps: ApiDependencies = {
      logger: createNullLogger(),
      verifier: new ServiceAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
      bootstrapVerifier: new BootstrapAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
      agentRepo: {} as ApiDependencies['agentRepo'],
      versionRepo: {} as ApiDependencies['versionRepo'],
      lifecycleService: {} as ApiDependencies['lifecycleService'],
      draftService: {} as ApiDependencies['draftService'],
      discardService: {} as ApiDependencies['discardService'],
      publicationService: {} as ApiDependencies['publicationService'],
      userOrgContextRepo: {} as ApiDependencies['userOrgContextRepo'],
      organizationRepo: {
        findOrganizationById: async ({ id }: { id: string }) =>
          id === orgId || id === otherOrgId ? { id, status: 'ACTIVE' } : null,
      } as unknown as OrganizationRepository,
      membershipRepo: {
        findMembership: async (q: { organizationId: string; userId: string }) =>
          q.organizationId === orgId && q.userId === sub ? { ...q, role, status: 'ACTIVE' } : null,
      } as unknown as MembershipRepository,
      knowledgeRetrievalPreview: {
        preview: async (input) => {
          calls.push(input);
          if (failWith) throw failWith;
          return result;
        },
      },
    };
    app = createApp(deps);
  });

  beforeEach(() => {
    role = 'OWNER';
    calls = [];
    failWith = null;
  });

  async function post(body: unknown, org = orgId) {
    const key = await importJWK(privateJwk, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      sub,
      orgId: org,
      iss: 'voice-agent:web',
      aud: 'voice-agent:api',
      jti: `j-${Math.random()}`,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + 30)
      .sign(key);
    return app.request('/v1/knowledge/retrieval-preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const question = { queryText: 'Quais transmissores de pressão a Qualitec oferece?', agentId };

  it('returns the preview for OWNER, ADMIN and MANAGER using the assertion organization', async () => {
    for (const r of ['OWNER', 'ADMIN', 'MANAGER'] as const) {
      role = r;
      const res = await post(question);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ trust: 'UNTRUSTED_DATA', mode: 'AGENT' });
    }
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(c).toEqual({ organizationId: orgId, ...question });
  });

  it('denies OPERATOR, VIEWER and members of other organizations', async () => {
    for (const r of ['OPERATOR', 'VIEWER'] as const) {
      role = r;
      expect((await post(question)).status).toBe(403);
    }
    role = 'OWNER';
    expect((await post(question, otherOrgId)).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('validates the body before reaching the service', async () => {
    const invalid = [
      { queryText: '' },
      { queryText: 'x'.repeat(501) },
      { queryText: 'ok', agentId: 'not-a-uuid' },
      { queryText: 'ok', topK: 11 },
      { queryText: 'ok', organizationId: otherOrgId },
    ];
    for (const body of invalid) expect((await post(body)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('propagates the stable agent errors', async () => {
    failWith = new AppError('no', 409, 'KNOWLEDGE_AGENT_NOT_PUBLISHED');
    const res = await post(question);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'KNOWLEDGE_AGENT_NOT_PUBLISHED',
    );
  });
});
