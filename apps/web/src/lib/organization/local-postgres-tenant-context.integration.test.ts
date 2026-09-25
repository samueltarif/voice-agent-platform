import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createDatabaseConnection,
  UserOrganizationContextRepository,
  OrganizationRepository,
  MembershipRepository,
} from '@voice-agent/database';
import { BootstrapApiClient } from '../api/bootstrap-api-client.js';
import { ActiveOrganizationContextResolver } from './active-organization-context-resolver.js';
import { generateKeyPair, exportJWK } from 'jose';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('Local PostgreSQL Active Organization Resolution (Data & Auth Boundary)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const userOrgContextRepo = new UserOrganizationContextRepository(db);
  const orgRepo = new OrganizationRepository(db);
  const membershipRepo = new MembershipRepository(db);

  const testSuffix = Math.random().toString(36).substring(2, 8);
  const userAId = `usr_local_a_${testSuffix}`;
  const userBId = `usr_local_b_${testSuffix}`;

  const slugA = `local-org-a-${testSuffix}`;
  const slugB = `local-org-b-${testSuffix}`;
  const slugC = `local-org-c-${testSuffix}`;

  let orgAId: string;
  let orgBId: string;
  let orgCId: string;

  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [userAId, userBId];

  let bootstrapClient: BootstrapApiClient;
  const resolver = new ActiveOrganizationContextResolver();

  beforeAll(async () => {
    // 1. Seed users using direct query through database pool
    await pool.query(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES 
       ($1, $2, $3, true, NOW(), NOW()),
       ($4, $5, $6, true, NOW(), NOW())`,
      [userAId, 'User A', `${userAId}@example.com`, userBId, 'User B', `${userBId}@example.com`],
    );

    // 2. Seed organizations
    const orgA = await orgRepo.createOrganization({ name: 'Local Org A', slug: slugA });
    const orgB = await orgRepo.createOrganization({ name: 'Local Org B', slug: slugB });
    const orgC = await orgRepo.createOrganization({ name: 'Local Org C', slug: slugC });

    if (!orgA || !orgB || !orgC) {
      throw new Error('Failed to create test organizations');
    }

    orgAId = orgA.id;
    createdOrgIds.push(orgAId);
    orgBId = orgB.id;
    createdOrgIds.push(orgBId);
    orgCId = orgC.id;
    createdOrgIds.push(orgCId);

    // 3. Seed memberships
    await membershipRepo.createMembership({
      organizationId: orgAId,
      userId: userAId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    await membershipRepo.createMembership({
      organizationId: orgBId,
      userId: userAId,
      role: 'VIEWER',
      status: 'ACTIVE',
    });

    await membershipRepo.createMembership({
      organizationId: orgCId,
      userId: userBId,
      role: 'OWNER',
      status: 'ACTIVE',
    });

    // 4. Create bootstrapClient whose fetchFn delegates directly to real PostgreSQL repository
    const fakeFetch: typeof fetch = async (input) => {
      const url = new URL(String(input));
      const pathname = url.pathname;

      if (pathname === '/v1/me/organizations') {
        const orgs = await userOrgContextRepo.listActiveOrganizationsForUser(userAId);
        return new Response(JSON.stringify(orgs), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (pathname.startsWith('/v1/me/organizations/')) {
        const slug = decodeURIComponent(pathname.replace('/v1/me/organizations/', ''));
        const org = await userOrgContextRepo.findActiveOrganizationBySlugForUser({
          userId: userAId,
          slug,
        });
        if (!org) {
          return new Response(JSON.stringify({ error: { message: 'Not Found' } }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(org), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response('Not Found', { status: 404 });
    };

    // Generate valid ephemeral Ed25519 test JWK for signing assertion internally
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const privateJwk = await exportJWK(keyPair.privateKey);
    privateJwk.kid = 'local-test-kid';

    bootstrapClient = new BootstrapApiClient({
      baseUrl: 'http://localhost:3001',
      privateJwk,
      kid: 'local-test-kid',
      fetchFn: fakeFetch,
    });
  });

  afterAll(async () => {
    // Fail-visible cleanup of all seeded database entities
    if (createdOrgIds.length > 0) {
      await pool.query(
        'DELETE FROM organization_memberships WHERE organization_id = ANY($1::uuid[])',
        [createdOrgIds],
      );
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [createdOrgIds]);
    }
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [createdUserIds]);
    }
    await pool.end();
  });

  it('Case 1: User A resolves Org A when preferred', async () => {
    const res = await resolver.resolve({
      userId: userAId,
      preferredSlug: slugA,
      bootstrapClient,
    });
    expect(res.status).toBe('RESOLVED');
    expect(res.context?.organizationId).toBe(orgAId);
    expect(res.context?.slug).toBe(slugA);
    expect(res.context?.role).toBe('ADMIN');
    expect(res.stalePreferenceDetected).toBeUndefined();
  });

  it('Case 2: User A resolves Org B when preferred', async () => {
    const res = await resolver.resolve({
      userId: userAId,
      preferredSlug: slugB,
      bootstrapClient,
    });
    expect(res.status).toBe('RESOLVED');
    expect(res.context?.organizationId).toBe(orgBId);
    expect(res.context?.slug).toBe(slugB);
    expect(res.context?.role).toBe('VIEWER');
    expect(res.stalePreferenceDetected).toBeUndefined();
  });

  it('Case 3: User A is denied access to Org C without membership and falls back safely', async () => {
    const res = await resolver.resolve({
      userId: userAId,
      preferredSlug: slugC,
      bootstrapClient,
    });
    expect(res.status).toBe('RESOLVED');
    // Org C is not accessible to User A; resolver falls back to Org A
    expect(res.context?.organizationId).not.toBe(orgCId);
    expect(res.context?.organizationId).toBe(orgAId);
    expect(res.stalePreferenceDetected).toBe(true);
  });

  it('Case 4: Membership revocation in PostgreSQL removes access immediately on next resolution', async () => {
    // Revoke membership in Org B directly in PostgreSQL
    await pool.query(
      `UPDATE organization_memberships 
       SET status = 'SUSPENDED', updated_at = NOW() 
       WHERE organization_id = $1::uuid AND user_id = $2`,
      [orgBId, userAId],
    );

    const res = await resolver.resolve({
      userId: userAId,
      preferredSlug: slugB,
      bootstrapClient,
    });

    expect(res.status).toBe('RESOLVED');
    // Stale preference detected because Org B membership is SUSPENDED in DB
    expect(res.context?.organizationId).toBe(orgAId);
    expect(res.stalePreferenceDetected).toBe(true);
  });

  it('Case 5: Role update in PostgreSQL is immediately reflected on next resolution', async () => {
    // Promote User A to OWNER in Org A directly in PostgreSQL
    await pool.query(
      `UPDATE organization_memberships 
       SET role = 'OWNER', updated_at = NOW() 
       WHERE organization_id = $1::uuid AND user_id = $2`,
      [orgAId, userAId],
    );

    const res = await resolver.resolve({
      userId: userAId,
      preferredSlug: slugA,
      bootstrapClient,
    });

    expect(res.status).toBe('RESOLVED');
    expect(res.context?.role).toBe('OWNER');
  });
});
