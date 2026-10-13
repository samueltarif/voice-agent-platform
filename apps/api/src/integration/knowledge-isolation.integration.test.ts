import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { createApp } from '../app.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import { BootstrapAssertionVerifier } from '../auth/bootstrap-assertion-verifier.js';
import { createNullLogger } from '@voice-agent/logger';
import {
  createDatabaseConnection,
  DrizzleKnowledgeRepository,
  MembershipRepository,
  OrganizationRepository,
  UserOrganizationContextRepository,
  user,
  agents,
} from '@voice-agent/database';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('Knowledge Base Tenant Isolation (007J Real-Repository HTTP Integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const membershipRepo = new MembershipRepository(db);
  const organizationRepo = new OrganizationRepository(db);
  const userOrgContextRepo = new UserOrganizationContextRepository(db);
  const knowledgeRepo = new DrizzleKnowledgeRepository(db);

  let app: ReturnType<typeof createApp>;
  let privateJwk: JWK;
  const kid = 'kb-isolation-key-1';
  const testSuffix = Math.random().toString(36).substring(2, 8);
  const ownerA = `usr_kb_iso_owner_a_${testSuffix}`;
  const viewerA = `usr_kb_iso_viewer_a_${testSuffix}`;
  const managerA = `usr_kb_iso_manager_a_${testSuffix}`;
  const ownerB = `usr_kb_iso_owner_b_${testSuffix}`;
  const createdUserIds = [ownerA, viewerA, managerA, ownerB];
  const createdOrgIds: string[] = [];
  let orgAId = '';
  let orgBId = '';
  let foreignAgentBId = '';

  beforeAll(async () => {
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateJwk = await exportJWK(keyPair.privateKey);
    const publicJwk = await exportJWK(keyPair.publicKey);
    privateJwk.kid = kid;
    publicJwk.kid = kid;

    const verifier = new ServiceAssertionVerifier({ publicJwks: { keys: [publicJwk] } });
    const bootstrapVerifier = new BootstrapAssertionVerifier({ publicJwks: { keys: [publicJwk] } });

    app = createApp({
      logger: createNullLogger(),
      verifier,
      bootstrapVerifier,
      agentRepo: {},
      versionRepo: {},
      lifecycleService: {},
      draftService: {},
      discardService: {},
      publicationService: {},
      membershipRepo,
      organizationRepo,
      userOrgContextRepo,
      knowledgeRepo,
    } as never);

    await db.insert(user).values(
      createdUserIds.map((id, index) => ({
        id,
        name: `KB Isolation User ${index} ${testSuffix}`,
        email: `kb-iso-${index}-${testSuffix}@example.com`,
      })),
    );

    const orgA = await organizationRepo.createOrganization({
      slug: `kb-iso-a-${testSuffix}`,
      name: `KB Isolation A ${testSuffix}`,
      status: 'ACTIVE',
    });
    const orgB = await organizationRepo.createOrganization({
      slug: `kb-iso-b-${testSuffix}`,
      name: `KB Isolation B ${testSuffix}`,
      status: 'ACTIVE',
    });
    if (!orgA || !orgB) throw new Error('Failed to create test organizations');
    orgAId = orgA.id;
    orgBId = orgB.id;
    createdOrgIds.push(orgAId, orgBId);

    await membershipRepo.createMembership({
      organizationId: orgAId,
      userId: ownerA,
      role: 'OWNER',
      status: 'ACTIVE',
    });
    await membershipRepo.createMembership({
      organizationId: orgAId,
      userId: viewerA,
      role: 'VIEWER',
      status: 'ACTIVE',
    });
    await membershipRepo.createMembership({
      organizationId: orgAId,
      userId: managerA,
      role: 'MANAGER',
      status: 'ACTIVE',
    });
    await membershipRepo.createMembership({
      organizationId: orgBId,
      userId: ownerB,
      role: 'OWNER',
      status: 'ACTIVE',
    });

    const [agentB] = await db
      .insert(agents)
      .values({
        organizationId: orgBId,
        name: `KB Isolation Agent B ${testSuffix}`,
        slug: `kb-iso-agent-b-${testSuffix}`,
        status: 'ACTIVE',
      })
      .returning();
    if (!agentB) throw new Error('Failed to create foreign agent fixture');
    foreignAgentBId = agentB.id;
  });

  afterAll(async () => {
    try {
      if (createdOrgIds.length > 0) {
        await pool.query('DELETE FROM agent_versions WHERE organization_id = ANY($1::uuid[])', [
          createdOrgIds,
        ]);
        await pool.query('DELETE FROM agents WHERE organization_id = ANY($1::uuid[])', [
          createdOrgIds,
        ]);
        await pool.query('DELETE FROM knowledge_chunks WHERE organization_id = ANY($1::uuid[])', [
          createdOrgIds,
        ]);
        await pool.query(
          'DELETE FROM knowledge_documents WHERE organization_id = ANY($1::uuid[])',
          [createdOrgIds],
        );
        await pool.query(
          'DELETE FROM organization_memberships WHERE organization_id = ANY($1::uuid[])',
          [createdOrgIds],
        );
        await pool.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [createdOrgIds]);
        const leftovers = await pool.query(
          'SELECT id FROM knowledge_documents WHERE organization_id = ANY($1::uuid[])',
          [createdOrgIds],
        );
        expect(leftovers.rowCount).toBe(0);
      }
      await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [createdUserIds]);
    } finally {
      await pool.end();
    }
  });

  async function signToken(actorId: string, orgId: string): Promise<string> {
    const { importJWK } = await import('jose');
    const key = await importJWK(privateJwk, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      sub: actorId,
      orgId,
      iss: 'voice-agent:web',
      aud: 'voice-agent:api',
      iat: now,
      exp: now + 30,
      jti: `jti-kb-iso-${Math.random()}`,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .sign(key);
  }

  function postDocument(token: string, payload: unknown) {
    return app.request('/v1/knowledge/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  it('ingests a document for OWNER and persists it tenant-scoped', async () => {
    const token = await signToken(ownerA, orgAId);
    const res = await postDocument(token, {
      title: `Isolation Ingest ${testSuffix}`,
      source: { sourceType: 'FAQ', locator: `iso/ingest-${testSuffix}.md` },
      rawText: `Isolation ingest content ${testSuffix}.`,
      collection: 'support',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      organizationId: string;
      status: string;
      isIdempotentDuplicate: boolean;
    };
    expect(body.organizationId).toBe(orgAId);
    expect(body.status).toBe('READY');
    expect(body.isIdempotentDuplicate).toBe(false);

    const persisted = await knowledgeRepo.getDocumentById(orgAId, body.id);
    expect(persisted?.organizationId).toBe(orgAId);
    expect(persisted?.status).toBe('READY');
  });

  it('rejects ingestion for VIEWER with 403', async () => {
    const token = await signToken(viewerA, orgAId);
    const res = await postDocument(token, {
      title: `Viewer Ingest ${testSuffix}`,
      source: { sourceType: 'FAQ', locator: `iso/viewer-${testSuffix}.md` },
      rawText: `Viewer ingest attempt ${testSuffix}.`,
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 for cross-tenant document detail with no existence oracle', async () => {
    const tokenA = await signToken(ownerA, orgAId);
    const created = await postDocument(tokenA, {
      title: `Cross Tenant Detail ${testSuffix}`,
      source: { sourceType: 'POLICY', locator: `iso/cross-detail-${testSuffix}.md` },
      rawText: `Cross tenant detail content ${testSuffix}.`,
    });
    expect(created.status).toBe(201);
    const { id: docId } = (await created.json()) as { id: string };

    const tokenB = await signToken(ownerB, orgBId);
    const cross = await app.request(`/v1/knowledge/documents/${docId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(cross.status).toBe(404);
    const crossBody = (await cross.json()) as { error: { code: string } };
    expect(crossBody.error.code).toBe('NOT_FOUND');

    const missing = await app.request(`/v1/knowledge/documents/${randomUUID()}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(missing.status).toBe(404);
  });

  it('returns 404 for cross-tenant archive without touching the document', async () => {
    const tokenA = await signToken(ownerA, orgAId);
    const created = await postDocument(tokenA, {
      title: `Cross Tenant Archive ${testSuffix}`,
      source: { sourceType: 'POLICY', locator: `iso/cross-archive-${testSuffix}.md` },
      rawText: `Cross tenant archive content ${testSuffix}.`,
    });
    expect(created.status).toBe(201);
    const { id: docId } = (await created.json()) as { id: string };

    const tokenB = await signToken(ownerB, orgBId);
    const cross = await app.request(`/v1/knowledge/documents/${docId}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(cross.status).toBe(404);

    const persisted = await knowledgeRepo.getDocumentById(orgAId, docId);
    expect(persisted?.status).toBe('READY');
  });

  it('rejects MANAGER archive with 403 and allows OWNER archive with 200', async () => {
    const tokenA = await signToken(ownerA, orgAId);
    const created = await postDocument(tokenA, {
      title: `Archive RBAC ${testSuffix}`,
      source: { sourceType: 'POLICY', locator: `iso/archive-rbac-${testSuffix}.md` },
      rawText: `Archive RBAC content ${testSuffix}.`,
    });
    expect(created.status).toBe(201);
    const { id: docId } = (await created.json()) as { id: string };

    const managerToken = await signToken(managerA, orgAId);
    const denied = await app.request(`/v1/knowledge/documents/${docId}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    expect(denied.status).toBe(403);

    const allowed = await app.request(`/v1/knowledge/documents/${docId}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(allowed.status).toBe(200);
    const archived = (await allowed.json()) as { status: string };
    expect(archived.status).toBe('ARCHIVED');
  });

  it('scopes list results to the requesting tenant', async () => {
    const tokenA = await signToken(ownerA, orgAId);
    await postDocument(tokenA, {
      title: `List Scope ${testSuffix}`,
      source: { sourceType: 'FAQ', locator: `iso/list-scope-${testSuffix}.md` },
      rawText: `List scope content ${testSuffix}.`,
    });
    const listA = await app.request('/v1/knowledge/documents', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(listA.status).toBe(200);
    const docsA = (await listA.json()) as Array<{ organizationId: string }>;
    expect(docsA.length).toBeGreaterThan(0);
    for (const doc of docsA) expect(doc.organizationId).toBe(orgAId);

    const tokenB = await signToken(ownerB, orgBId);
    const listB = await app.request('/v1/knowledge/documents', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(listB.status).toBe(200);
    expect(await listB.json()).toEqual([]);
  });

  it('rejects foreign agent association through HTTP with 404 NOT_FOUND', async () => {
    const token = await signToken(ownerA, orgAId);
    const res = await postDocument(token, {
      title: `Foreign Agent HTTP ${testSuffix}`,
      source: { sourceType: 'FAQ', locator: `iso/foreign-agent-${testSuffix}.md` },
      rawText: `Foreign agent HTTP attempt ${testSuffix}.`,
      agentId: foreignAgentBId,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).not.toContain(foreignAgentBId);
  });

  it('excludes full text, chunks and internal errors from metadata DTOs', async () => {
    const token = await signToken(ownerA, orgAId);
    const created = await postDocument(token, {
      title: `DTO Exclusion ${testSuffix}`,
      source: { sourceType: 'FAQ', locator: `iso/dto-exclusion-${testSuffix}.md` },
      rawText: `DTO exclusion sensitive content ${testSuffix}.`,
    });
    expect(created.status).toBe(201);
    const ingestBody = (await created.json()) as Record<string, unknown>;
    for (const forbidden of ['rawText', 'chunks', 'errorMessage', 'text']) {
      expect(ingestBody).not.toHaveProperty(forbidden);
    }

    const detail = await app.request(`/v1/knowledge/documents/${ingestBody.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as Record<string, unknown>;
    for (const forbidden of ['rawText', 'chunks', 'errorMessage', 'text']) {
      expect(detailBody).not.toHaveProperty(forbidden);
    }
    expect(JSON.stringify(detailBody)).not.toContain(`DTO exclusion sensitive content`);
  });

  it('maps a real idempotency conflict to HTTP 409 CONFLICT', async () => {
    const token = await signToken(ownerA, orgAId);
    const locator = `iso/real-conflict-${testSuffix}.md`;
    const first = await postDocument(token, {
      title: `Real Conflict ${testSuffix}`,
      source: { sourceType: 'FAQ', locator },
      rawText: `Real conflict content ${testSuffix}.`,
    });
    expect(first.status).toBe(201);

    const second = await postDocument(token, {
      title: `Different Title ${testSuffix}`,
      source: { sourceType: 'FAQ', locator },
      rawText: `Real conflict content ${testSuffix}.`,
    });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).not.toMatch(/syntax error|relation "|column "/i);
  });
});
