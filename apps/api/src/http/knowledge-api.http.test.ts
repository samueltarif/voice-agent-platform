import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { createApp } from '../app.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import { BootstrapAssertionVerifier } from '../auth/bootstrap-assertion-verifier.js';
import { createNullLogger } from '@voice-agent/logger';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import type { OrganizationRepository, MembershipRepository } from '@voice-agent/database';
import type {
  TenantRole,
  KnowledgeDocument,
  KnowledgeRepositoryPort,
  IngestKnowledgeDocumentInput,
  IngestKnowledgeDocumentResult,
  ListKnowledgeDocumentsOptions,
} from '@voice-agent/contracts';

describe('HTTP /v1 Knowledge Management API Suite', () => {
  let app: ReturnType<typeof createApp>;
  let privateJwk: JWK;
  const kid = 'kb-test-key-1';
  const orgId = '11111111-1111-1111-1111-111111111111';
  const otherOrgId = '99999999-9999-9999-9999-999999999999';
  const sub = 'user-kb-sub-1';
  let currentRole: TenantRole = 'OWNER';
  let orgStatus: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE';
  let membershipStatus: 'ACTIVE' | 'REVOKED' = 'ACTIVE';
  let membershipExists = true;

  const sampleDocId = '22222222-2222-2222-2222-222222222222';
  const sampleDoc: KnowledgeDocument = {
    id: sampleDocId,
    organizationId: orgId,
    title: 'Return Policy FAQ',
    source: {
      sourceType: 'FAQ',
      locator: 'faq/returns-v1',
    },
    contentIdentity: { algorithm: 'sha256', value: 'fake-sha256-hash' },
    status: 'READY',
    collection: 'support',
    createdAt: new Date('2026-10-09T12:00:00Z'),
    updatedAt: new Date('2026-10-09T12:00:00Z'),
  };

  const archivedDoc: KnowledgeDocument = {
    ...sampleDoc,
    status: 'ARCHIVED',
    updatedAt: new Date('2026-10-09T12:05:00Z'),
  };

  const fakeKnowledgeRepo: KnowledgeRepositoryPort = {
    async ingestDocument(
      input: IngestKnowledgeDocumentInput,
    ): Promise<IngestKnowledgeDocumentResult> {
      if (input.rawText.includes('TRIGGER_CONFLICT')) {
        throw new Error(
          `Conflicting duplicate document content identity 'hash' already exists for source '${input.source.locator}' with different title or content`,
        );
      }
      if (input.rawText.includes('TRIGGER_CONCURRENT_FAIL')) {
        throw new Error(
          'Concurrent knowledge document ingestion failed: existing document is in FAILED state',
        );
      }
      if (input.rawText.includes('TRIGGER_DB_ERROR')) {
        throw new Error('relation "some_table" does not exist (syntax error at or near...)');
      }
      const isDuplicate = input.rawText.includes('DUPLICATE_PAYLOAD');
      return {
        document: {
          id: sampleDocId,
          organizationId: input.organizationId,
          title: input.title,
          source: input.source,
          contentIdentity: { algorithm: 'sha256', value: 'computed-hash' },
          status: 'READY',
          collection: input.collection,
          agentId: input.agentId,
          agentVersionId: input.agentVersionId,
          createdAt: new Date('2026-10-09T12:00:00Z'),
          updatedAt: new Date('2026-10-09T12:00:00Z'),
        },
        chunks: [],
        isIdempotentDuplicate: isDuplicate,
      };
    },
    async getDocumentById(targetOrgId: string, docId: string): Promise<KnowledgeDocument | null> {
      if (targetOrgId !== orgId || docId !== sampleDocId) {
        return null;
      }
      return sampleDoc;
    },
    async listDocuments(
      targetOrgId: string,
      options?: ListKnowledgeDocumentsOptions,
    ): Promise<KnowledgeDocument[]> {
      if (targetOrgId !== orgId) return [];
      if (options?.status && options.status !== sampleDoc.status) return [];
      if (options?.collection && options.collection !== sampleDoc.collection) return [];
      return [sampleDoc];
    },
    async archiveDocument(targetOrgId: string, docId: string): Promise<KnowledgeDocument> {
      if (targetOrgId !== orgId || docId !== sampleDocId) {
        throw new Error(`Knowledge document '${docId}' not found for tenant`);
      }
      return archivedDoc;
    },
  };

  beforeAll(async () => {
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = await exportJWK(keyPair.privateKey);
    const publicJwk = await exportJWK(keyPair.publicKey);
    privateJwk.kid = kid;
    publicJwk.kid = kid;

    const verifier = new ServiceAssertionVerifier({ publicJwks: { keys: [publicJwk] } });

    const mockOrgRepo = {
      findOrganizationById: async ({ id }: { id: string }) => {
        if (id === orgId) return { id: orgId, status: orgStatus };
        if (id === otherOrgId) return { id: otherOrgId, status: 'ACTIVE' };
        return null;
      },
    } as unknown as OrganizationRepository;

    const mockMembershipRepo = {
      findMembership: async ({
        organizationId,
        userId,
      }: {
        organizationId: string;
        userId: string;
      }) => {
        if (!membershipExists) return null;
        if (organizationId === orgId && userId === sub) {
          return { organizationId, userId, role: currentRole, status: membershipStatus };
        }
        return null;
      },
    } as unknown as MembershipRepository;

    const dummyDeps: ApiDependencies = {
      logger: createNullLogger(),
      verifier,
      bootstrapVerifier: new BootstrapAssertionVerifier({ publicJwks: { keys: [publicJwk] } }),
      agentRepo: {} as ApiDependencies['agentRepo'],
      versionRepo: {} as ApiDependencies['versionRepo'],
      lifecycleService: {} as ApiDependencies['lifecycleService'],
      draftService: {} as ApiDependencies['draftService'],
      discardService: {} as ApiDependencies['discardService'],
      publicationService: {} as ApiDependencies['publicationService'],
      membershipRepo: mockMembershipRepo,
      organizationRepo: mockOrgRepo,
      userOrgContextRepo: {} as ApiDependencies['userOrgContextRepo'],
      knowledgeRepo: fakeKnowledgeRepo,
    };

    app = createApp(dummyDeps);
  });

  async function getAssertion(overrides?: {
    sub?: string;
    orgId?: string;
    expDelta?: number;
  }): Promise<string> {
    const { importJWK } = await import('jose');
    const key = await importJWK(privateJwk, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (overrides?.expDelta ?? 30);
    return new SignJWT({
      sub: overrides?.sub ?? sub,
      orgId: overrides?.orgId ?? orgId,
      iss: 'voice-agent:web',
      aud: 'voice-agent:api',
      jti: `assertion-${Math.random()}`,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(key);
  }

  // --- 1. Authentication & Security Edge Cases ---
  it('rejects unauthenticated requests to knowledge routes with 401', async () => {
    const res = await app.request('/v1/knowledge/documents', { method: 'GET' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('AUTHENTICATION_ERROR');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('rejects expired assertions with 401', async () => {
    const expiredToken = await getAssertion({ expDelta: -10 });
    const res = await app.request('/v1/knowledge/documents', {
      method: 'GET',
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(res.status).toBe(401);
  });

  it('rejects requests when organization is inactive with 403', async () => {
    orgStatus = 'SUSPENDED';
    const token = await getAssertion();
    const res = await app.request('/v1/knowledge/documents', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    orgStatus = 'ACTIVE';
  });

  it('rejects requests when membership is missing with 403', async () => {
    membershipExists = false;
    const token = await getAssertion();
    const res = await app.request('/v1/knowledge/documents', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    membershipExists = true;
  });

  it('rejects requests when membership is inactive with 403', async () => {
    membershipStatus = 'REVOKED';
    const token = await getAssertion();
    const res = await app.request('/v1/knowledge/documents', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    membershipStatus = 'ACTIVE';
  });

  // --- 2. Ingestion Endpoint ---
  it('allows document ingestion for OWNER with valid payload', async () => {
    currentRole = 'OWNER';
    const token = await getAssertion();
    const res = await app.request('/v1/knowledge/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Return Policy',
        source: { sourceType: 'FAQ', locator: 'faq/returns' },
        rawText: 'Returns are accepted within 30 days of purchase.',
        collection: 'support',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      organizationId: string;
      title: string;
      status: string;
      isIdempotentDuplicate: boolean;
    };
    expect(body.id).toBe(sampleDocId);
    expect(body.organizationId).toBe(orgId);
    expect(body.title).toBe('Return Policy');
    expect(body.status).toBe('READY');
    expect(body.isIdempotentDuplicate).toBe(false);
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('returns isIdempotentDuplicate = true on idempotent same-payload duplicate', async () => {
    currentRole = 'OWNER';
    const token = await getAssertion();
    const res = await app.request('/v1/knowledge/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Return Policy',
        source: { sourceType: 'FAQ', locator: 'faq/returns' },
        rawText: 'DUPLICATE_PAYLOAD: Returns are accepted within 30 days.',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { isIdempotentDuplicate: boolean };
    expect(body.isIdempotentDuplicate).toBe(true);
  });

  it('rejects client-supplied organizationId or arbitrary extra fields in request body', async () => {
    currentRole = 'OWNER';
    const token = await getAssertion();
    const res = await app.request('/v1/knowledge/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: '88888888-8888-8888-8888-888888888888',
        title: 'Sneaky Injection',
        source: { sourceType: 'FAQ', locator: 'faq/spoof' },
        rawText: 'Spoofing attempt',
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing or empty title/rawText with 400', async () => {
    currentRole = 'OWNER';
    const token = await getAssertion();
    const res = await app.request('/v1/knowledge/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '',
        source: { sourceType: 'FAQ', locator: 'faq/empty' },
        rawText: 'Valid text',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('maps domain conflict to HTTP 409 ConflictError without raw SQL leakage', async () => {
    currentRole = 'OWNER';
    const token = await getAssertion();
    const res = await app.request('/v1/knowledge/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Return Policy Conflicting',
        source: { sourceType: 'FAQ', locator: 'faq/returns' },
        rawText: 'TRIGGER_CONFLICT: different content here',
      }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toContain('Conflicting duplicate document');
    expect(body.error.message).not.toContain('syntax error');
  });

  it('sanitizes unexpected internal database error to 500 without leaking SQL internals', async () => {
    currentRole = 'OWNER';
    const token = await getAssertion();
    const res = await app.request('/v1/knowledge/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Error Doc',
        source: { sourceType: 'FAQ', locator: 'faq/error' },
        rawText: 'TRIGGER_DB_ERROR',
      }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error.message).toBe('An unexpected internal error occurred');
    expect(JSON.stringify(body)).not.toContain('some_table');
  });

  // --- 3. Document Listing & Detail ---
  it('lists documents for authorized user with bounded pagination', async () => {
    currentRole = 'OWNER';
    const token = await getAssertion();
    const res = await app.request('/v1/knowledge/documents?limit=10&offset=0', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string; organizationId: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0]?.id).toBe(sampleDocId);
    expect(body[0]?.organizationId).toBe(orgId);
  });

  it('retrieves document metadata by id', async () => {
    currentRole = 'OWNER';
    const token = await getAssertion();
    const res = await app.request(`/v1/knowledge/documents/${sampleDocId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; title: string };
    expect(body.id).toBe(sampleDocId);
    expect(body.title).toBe('Return Policy FAQ');
  });

  it('returns 404 for non-existent document ID', async () => {
    currentRole = 'OWNER';
    const token = await getAssertion();
    const nonExistentId = '33333333-3333-3333-3333-333333333333';
    const res = await app.request(`/v1/knowledge/documents/${nonExistentId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('prevents cross-tenant document enumeration (returns 404 for document in other tenant)', async () => {
    // Other tenant token trying to read sampleDocId which belongs to orgId
    const otherToken = await getAssertion({ orgId: otherOrgId });
    const res = await app.request(`/v1/knowledge/documents/${sampleDocId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${otherToken}` },
    });

    // Denied by tenant-scoped query (fail-closed / anti-enumeration)
    expect([403, 404]).toContain(res.status);
  });

  // --- 4. Archiving Lifecycle ---
  it('allows archiving by OWNER', async () => {
    currentRole = 'OWNER';
    const token = await getAssertion();
    const res = await app.request(`/v1/knowledge/documents/${sampleDocId}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBe(sampleDocId);
    expect(body.status).toBe('ARCHIVED');
  });

  it('rejects archiving by MANAGER with 403 Forbidden', async () => {
    currentRole = 'MANAGER';
    const token = await getAssertion();
    const res = await app.request(`/v1/knowledge/documents/${sampleDocId}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toContain('knowledge.archive');
  });
});
