import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { createApp } from '../app.js';
import { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';
import { BootstrapAssertionVerifier } from '../auth/bootstrap-assertion-verifier.js';
import { createNullLogger } from '@voice-agent/logger';
import type { OrganizationContextResponse } from '@voice-agent/contracts';
import {
  createDatabaseConnection,
  UserOrganizationContextRepository,
  OrganizationRepository,
  MembershipRepository,
  AgentRepository,
  AgentVersionRepository,
  AgentLifecycleService,
  AgentDraftService,
  AgentDraftDiscardService,
  AgentPublicationService,
  CommercialEntitlementResolver,
  DefaultCommercialPublicationPolicy,
  user,
  organizations,
  organizationMemberships,
} from '@voice-agent/database';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('HTTP /v1/me/organizations Data & Authorization (PostgreSQL Integration)', () => {
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
  const kid = 'integration-me-key-1';
  const testSuffix = Math.random().toString(36).substring(2, 8);
  const userA = `usr_me_a_${testSuffix}`;
  const userB = `usr_me_b_${testSuffix}`;
  const userC = `usr_me_c_${testSuffix}`; // user with no orgs

  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [userA, userB, userC];

  let orgActiveA1Id: string;
  let orgActiveA2Id: string;
  let orgInactiveAId: string;
  let orgSuspendedMemberAId: string;
  let orgBId: string;

  const slugA1 = `slug-a1-${testSuffix}`;
  const slugA2 = `slug-a2-${testSuffix}`;
  const slugInactive = `slug-inact-${testSuffix}`;
  const slugSuspendedMember = `slug-susp-${testSuffix}`;
  const slugB = `slug-b-${testSuffix}`;

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

    // Seed users
    await db.insert(user).values([
      { id: userA, name: 'User A', email: `me_a_${testSuffix}@example.com` },
      { id: userB, name: 'User B', email: `me_b_${testSuffix}@example.com` },
      { id: userC, name: 'User C', email: `me_c_${testSuffix}@example.com` },
    ]);

    // Seed organizations
    const [oA1] = await db
      .insert(organizations)
      .values({ name: 'Alpha Org A1', slug: slugA1, status: 'ACTIVE' })
      .returning();
    const [oA2] = await db
      .insert(organizations)
      .values({ name: 'Beta Org A2', slug: slugA2, status: 'ACTIVE' })
      .returning();
    const [oInact] = await db
      .insert(organizations)
      .values({ name: 'Inactive Org A', slug: slugInactive, status: 'SUSPENDED' })
      .returning();
    const [oSuspMem] = await db
      .insert(organizations)
      .values({ name: 'Suspended Member Org A', slug: slugSuspendedMember, status: 'ACTIVE' })
      .returning();
    const [oB] = await db
      .insert(organizations)
      .values({ name: 'Org B Only', slug: slugB, status: 'ACTIVE' })
      .returning();

    orgActiveA1Id = oA1!.id;
    orgActiveA2Id = oA2!.id;
    orgInactiveAId = oInact!.id;
    orgSuspendedMemberAId = oSuspMem!.id;
    orgBId = oB!.id;

    createdOrgIds.push(orgActiveA1Id, orgActiveA2Id, orgInactiveAId, orgSuspendedMemberAId, orgBId);

    // Seed memberships
    await db.insert(organizationMemberships).values([
      // User A memberships
      { organizationId: orgActiveA1Id, userId: userA, role: 'OWNER', status: 'ACTIVE' },
      { organizationId: orgActiveA2Id, userId: userA, role: 'OPERATOR', status: 'ACTIVE' },
      { organizationId: orgInactiveAId, userId: userA, role: 'OWNER', status: 'ACTIVE' },
      {
        organizationId: orgSuspendedMemberAId,
        userId: userA,
        role: 'OPERATOR',
        status: 'SUSPENDED',
      },
      // User B memberships
      { organizationId: orgBId, userId: userB, role: 'OWNER', status: 'ACTIVE' },
    ]);
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await pool.query(
        'DELETE FROM organization_memberships WHERE organization_id = ANY($1::uuid[])',
        [createdOrgIds],
      );
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [createdOrgIds]);
    }
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [createdUserIds]);
    await pool.end();
  });

  async function createToken(sub: string): Promise<string> {
    const { importJWK } = await import('jose');
    const key = await importJWK(privateJwk, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      sub,
      scope: 'user:bootstrap',
      iss: 'voice-agent:web',
      aud: 'voice-agent:api:bootstrap',
      iat: now,
      exp: now + 30,
      jti: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
      .sign(key);
  }

  it('1. GET /v1/me/organizations returns only active orgs with active memberships for user A', async () => {
    const token = await createToken(userA);
    const res = await app.request('/v1/me/organizations', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as OrganizationContextResponse[];
    expect(body).toHaveLength(2);
    // Ordered by name ASC: Alpha Org A1, Beta Org A2
    expect(body[0]?.slug).toBe(slugA1);
    expect(body[0]?.role).toBe('OWNER');
    expect(body[1]?.slug).toBe(slugA2);
    expect(body[1]?.role).toBe('OPERATOR');

    // Strict DTO invariants
    for (const item of body) {
      expect(Object.keys(item).sort()).toEqual(['id', 'name', 'role', 'slug']);
    }
  });

  it('2. GET /v1/me/organizations returns empty array [] for user C with no memberships', async () => {
    const token = await createToken(userC);
    const res = await app.request('/v1/me/organizations', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('3. User A resolves own active organization by slug -> 200', async () => {
    const token = await createToken(userA);
    const res = await app.request(`/v1/me/organizations/${slugA1}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as OrganizationContextResponse;
    expect(body.id).toBe(orgActiveA1Id);
    expect(body.slug).toBe(slugA1);
    expect(body.name).toBe('Alpha Org A1');
    expect(body.role).toBe('OWNER');
    expect(Object.keys(body).sort()).toEqual(['id', 'name', 'role', 'slug']);
  });

  it('4. User A cannot resolve User B organization by slug -> 404', async () => {
    const token = await createToken(userA);
    const res = await app.request(`/v1/me/organizations/${slugB}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });

  it('5. User A cannot resolve inactive organization by slug -> 404', async () => {
    const token = await createToken(userA);
    const res = await app.request(`/v1/me/organizations/${slugInactive}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });

  it('6. User A cannot resolve org where membership is suspended by slug -> 404', async () => {
    const token = await createToken(userA);
    const res = await app.request(`/v1/me/organizations/${slugSuspendedMember}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });

  it('7. Non-existent slug returns 404', async () => {
    const token = await createToken(userA);
    const res = await app.request('/v1/me/organizations/totally-non-existent-slug-xyz', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });

  it('8. Database role alteration is reflected immediately in subsequent call', async () => {
    const token = await createToken(userA);

    // Initial check: role is OPERATOR
    const resInitial = await app.request(`/v1/me/organizations/${slugA2}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resInitial.status).toBe(200);
    const bodyInitial = (await resInitial.json()) as OrganizationContextResponse;
    expect(bodyInitial.role).toBe('OPERATOR');

    // Update role in DB to ADMIN
    await pool.query(
      'UPDATE organization_memberships SET role = $1 WHERE organization_id = $2 AND user_id = $3',
      ['ADMIN', orgActiveA2Id, userA],
    );

    // Subsequent check: role is ADMIN
    const resAfter = await app.request(`/v1/me/organizations/${slugA2}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resAfter.status).toBe(200);
    const bodyAfter = (await resAfter.json()) as OrganizationContextResponse;
    expect(bodyAfter.role).toBe('ADMIN');
  });
});
