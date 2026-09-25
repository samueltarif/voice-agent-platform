import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { createApp } from '../app.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import { BootstrapAssertionVerifier } from '../auth/bootstrap-assertion-verifier.js';
import { createNullLogger } from '@voice-agent/logger';
import type {
  AgentMetadataResponse,
  AgentVersionMetadataResponse,
  ApiErrorResponse,
} from '@voice-agent/contracts';
import {
  createDatabaseConnection,
  CommercialEntitlementResolver,
  DefaultCommercialPublicationPolicy,
  AgentRepository,
  AgentLifecycleService,
  AgentVersionRepository,
  AgentDraftService,
  AgentDraftDiscardService,
  AgentPublicationService,
  MembershipRepository,
  OrganizationRepository,
  UserOrganizationContextRepository,
  user,
  organizations,
  organizationMemberships,
  commercialGrants,
} from '@voice-agent/database';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('Agent Studio API Security & Tenant Isolation (PostgreSQL Integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const resolver = new CommercialEntitlementResolver(db);
  const publicationPolicy = new DefaultCommercialPublicationPolicy(db, resolver);

  const agentRepo = new AgentRepository(db);
  const versionRepo = new AgentVersionRepository(db);
  const lifecycleService = new AgentLifecycleService(db, resolver);
  const draftService = new AgentDraftService(db);
  const discardService = new AgentDraftDiscardService(db);
  const publicationService = new AgentPublicationService(db, publicationPolicy);
  const membershipRepo = new MembershipRepository(db);
  const organizationRepo = new OrganizationRepository(db);
  const userOrgContextRepo = new UserOrganizationContextRepository(db);

  let app: ReturnType<typeof createApp>;
  let privateJwk: JWK;
  const kid = 'integration-sec-key-1';
  const testSuffix = Math.random().toString(36).substring(2, 8);
  const userA = `usr_sec_a_${testSuffix}`;
  const userB = `usr_sec_b_${testSuffix}`;

  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [userA, userB];

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
      agentRepo,
      versionRepo,
      lifecycleService,
      draftService,
      discardService,
      publicationService,
      membershipRepo,
      organizationRepo,
      userOrgContextRepo,
    });

    await db.insert(user).values([
      { id: userA, name: 'User A', email: `sec_a_${testSuffix}@example.com` },
      { id: userB, name: 'User B', email: `sec_b_${testSuffix}@example.com` },
    ]);
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await pool.query('DELETE FROM agent_versions WHERE organization_id = ANY($1::uuid[])', [
        createdOrgIds,
      ]);
      await pool.query('DELETE FROM agents WHERE organization_id = ANY($1::uuid[])', [
        createdOrgIds,
      ]);
      await pool.query('DELETE FROM audit_logs WHERE organization_id = ANY($1::uuid[])', [
        createdOrgIds,
      ]);
      await pool.query('DELETE FROM commercial_grants WHERE organization_id = ANY($1::uuid[])', [
        createdOrgIds,
      ]);
      await pool.query(
        'DELETE FROM organization_memberships WHERE organization_id = ANY($1::uuid[])',
        [createdOrgIds],
      );
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [createdOrgIds]);
    }
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [createdUserIds]);
    await pool.end();
  });

  async function createOrg(name: string, ownerUserId: string) {
    const slug = `org-sec-${Math.random().toString(36).substring(2, 8)}`;
    const [org] = await db
      .insert(organizations)
      .values({ name, slug, status: 'ACTIVE' })
      .returning();

    createdOrgIds.push(org!.id);

    await db.insert(commercialGrants).values({
      organizationId: org!.id,
      featureKey: 'agents.max',
      overrideValue: '10',
      startsAt: new Date('2026-01-01'),
      endsAt: null,
      grantedBy: 'admin_test',
      reason: 'Testing Quota',
    });

    await db.insert(organizationMemberships).values({
      organizationId: org!.id,
      userId: ownerUserId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    return org!;
  }

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
      jti: `jti-sec-${Math.random()}`,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .sign(key);
  }

  it('Section 17: revalidates domain role dynamically against PostgreSQL', async () => {
    const org = await createOrg('Org Domain Reval', userA);
    const token = await signToken(userA, org.id);

    // 1. Create an agent as ADMIN
    const createRes = await app.request('/v1/agents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Publishable Agent', slug: 'pub-agent' }),
    });
    expect(createRes.status).toBe(201);
    const agent = (await createRes.json()) as AgentMetadataResponse;

    // Create a draft
    const draftRes = await app.request(`/v1/agents/${agent.id}/drafts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configuration: {
          persona: {
            role: 'Vendedor',
            companyName: 'Corp',
            objective: 'Vender',
            tone: 'FORMAL',
            greetingPhrase: 'Ola',
            closingPhrase: 'Tchau',
            fallbackPhrase: 'Repita',
          },
          voice: { languageCode: 'pt-BR' },
          rules: {
            conversational: ['Regra 1'],
            deterministic: { maxDiscountPercent: 5, operatingHours: '09:00-18:00' },
          },
          playbook: { stages: [{ name: 'Intro', goal: 'Apresentar' }] },
          examples: [{ customerInput: 'Oi', idealAgentResponse: 'Ola' }],
        },
      }),
    });
    expect(draftRes.status).toBe(201);
    const draft = (await draftRes.json()) as AgentVersionMetadataResponse;

    // 2. Demote userA in DB: ADMIN -> VIEWER
    await pool.query(
      `UPDATE organization_memberships SET role = 'VIEWER' WHERE organization_id = $1::uuid AND user_id = $2`,
      [org.id, userA],
    );

    // 3. Attempt to publish draft using the SAME unexpired token
    const publishRes = await app.request(`/v1/agents/${agent.id}/drafts/${draft.id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(publishRes.status).toBe(403);
    const err = (await publishRes.json()) as ApiErrorResponse;
    expect(err.error.code).toBe('FORBIDDEN');
  });

  it('Section 18: denies requests when membership is revoked/suspended in DB', async () => {
    const org = await createOrg('Org Revocation', userA);
    const token = await signToken(userA, org.id);

    // Initial call succeeds
    const res1 = await app.request('/v1/agents', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res1.status).toBe(200);

    // Suspend membership in DB
    await pool.query(
      `UPDATE organization_memberships SET status = 'SUSPENDED' WHERE organization_id = $1::uuid AND user_id = $2`,
      [org.id, userA],
    );

    // Subsequent call with the SAME assertion fails closed with 403
    const res2 = await app.request('/v1/agents', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res2.status).toBe(403);
    const err = (await res2.json()) as ApiErrorResponse;
    expect(err.error.code).toBe('FORBIDDEN');
  });

  it('Section 19: rejects signed org context attack (valid signature for non-member org)', async () => {
    const org = await createOrg('Org B Secure', userB);

    // User A signs a cryptographically valid token asserting orgId = orgB
    const spoofedToken = await signToken(userA, org.id);

    // Request must fail with 403 before touching agent resources
    const res = await app.request('/v1/agents', {
      headers: { Authorization: `Bearer ${spoofedToken}` },
    });
    expect(res.status).toBe(403);
    const err = (await res.json()) as ApiErrorResponse;
    expect(err.error.code).toBe('FORBIDDEN');
  });

  it('Section 20 & 22: preserves cross-tenant resource privacy and strict error mappings', async () => {
    const orgA = await createOrg('Org A Isol', userA);
    const orgB = await createOrg('Org B Isol', userB);

    const tokenA = await signToken(userA, orgA.id);
    const tokenB = await signToken(userB, orgB.id);

    // User B creates an agent in Org B
    const createBRes = await app.request('/v1/agents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Agent in Org B', slug: 'agent-b' }),
    });
    expect(createBRes.status).toBe(201);
    const agentB = (await createBRes.json()) as AgentMetadataResponse;

    // User A attempts to GET Agent B using Org A token -> 404 NOT_FOUND
    const getRes = await app.request(`/v1/agents/${agentB.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(getRes.status).toBe(404);
    const getBody = (await getRes.json()) as ApiErrorResponse;
    expect(getBody.error.code).toBe('NOT_FOUND');
    // Ensure zero leakage of foreign existence
    expect(JSON.stringify(getBody)).not.toContain('another organization');
    expect(JSON.stringify(getBody)).not.toContain('Org B');

    // User A attempts to archive Agent B using Org A token -> 404 NOT_FOUND
    const archiveRes = await app.request(`/v1/agents/${agentB.id}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(archiveRes.status).toBe(404);

    // Test ConflictError (409): Duplicate agent slug in same Org A
    await app.request('/v1/agents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Agent One', slug: 'agent-slug-1' }),
    });
    const dupRes = await app.request('/v1/agents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Agent Two', slug: 'agent-slug-1' }),
    });
    expect(dupRes.status).toBe(409);
    const dupBody = (await dupRes.json()) as ApiErrorResponse;
    expect(dupBody.error.code).toBe('CONFLICT');

    // Verify information disclosure protection across responses:
    // No SQL error, no internal constraints, no JOSE details
    const text = JSON.stringify(dupBody);
    expect(text).not.toContain('SELECT');
    expect(text).not.toContain('INSERT');
    expect(text).not.toContain('agents_slug_unique');
    expect(text).not.toContain('drizzle');
    expect(text).not.toContain('stack');
  });
});
