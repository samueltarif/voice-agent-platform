import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseConnection } from './client/connection.js';
import { OrganizationRepository } from './repositories/organization-repository.js';
import { MembershipRepository } from './repositories/membership-repository.js';
import { PlatformAdminRepository } from './repositories/platform-admin-repository.js';
import { user, organizations, plans } from './schema/index.js';
import { eq, sql } from 'drizzle-orm';
import type pg from 'pg';
import type { DatabaseInstance } from './client/connection.js';

const isStaging =
  process.env.APP_ENV === 'staging' &&
  process.env.STAGING_SMOKE_TESTS === 'true' &&
  Boolean(process.env.DATABASE_URL);

const describeStaging = isStaging ? describe : describe.skip;

describeStaging('Neon Staging Domain Integrity & Tenant Isolation Smoke Test', () => {
  let db: DatabaseInstance;
  let pool: pg.Pool;
  let orgRepo: OrganizationRepository;
  let memberRepo: MembershipRepository;
  let adminRepo: PlatformAdminRepository;

  const runId = crypto.randomUUID().slice(0, 8);
  const testUserId = `smoke-u-${runId}`;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    const client = createDatabaseConnection({ maxConnections: 2 });
    db = client.db;
    pool = client.pool;
    orgRepo = new OrganizationRepository(db);
    memberRepo = new MembershipRepository(db);
    adminRepo = new PlatformAdminRepository(db);

    await db.insert(user).values({
      id: testUserId,
      name: 'Staging Smoke User',
      email: `${testUserId}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const orgA = await orgRepo.createOrganization({
      name: `Smoke Org A ${runId}`,
      slug: `smoke-org-a-${runId}`,
      status: 'ACTIVE',
    });
    const orgB = await orgRepo.createOrganization({
      name: `Smoke Org B ${runId}`,
      slug: `smoke-org-b-${runId}`,
      status: 'ACTIVE',
    });

    if (!orgA || !orgB) {
      throw new Error('Failed to create test organizations in staging');
    }

    orgAId = orgA.id;
    orgBId = orgB.id;
  });

  afterAll(async () => {
    if (db) {
      await db.execute(
        sql`DELETE FROM platform_admin_authorizations WHERE user_id = ${testUserId};`,
      );
      await db.execute(sql`DELETE FROM organization_memberships WHERE user_id = ${testUserId};`);
      if (orgAId) await db.delete(organizations).where(eq(organizations.id, orgAId));
      if (orgBId) await db.delete(organizations).where(eq(organizations.id, orgBId));
      await db.delete(user).where(eq(user.id, testUserId));
    }
    if (pool) await pool.end();
  });

  it('proves multi-tenant isolation: Org B cannot access Org A memberships', async () => {
    await memberRepo.createMembership({
      organizationId: orgAId,
      userId: testUserId,
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    const orgAMembers = await memberRepo.listMemberships({ organizationId: orgAId });
    const orgBMembers = await memberRepo.listMemberships({ organizationId: orgBId });

    expect(orgAMembers).toHaveLength(1);
    expect(orgAMembers[0]?.userId).toBe(testUserId);
    expect(orgBMembers).toHaveLength(0);
  });

  it('rejects duplicate memberships for the same user in an organization', async () => {
    await expect(
      memberRepo.createMembership({
        organizationId: orgAId,
        userId: testUserId,
        role: 'ADMIN',
        status: 'ACTIVE',
      }),
    ).rejects.toThrow();
  });

  it('enforces physical check constraints: rejects plans with negative price', async () => {
    await expect(
      db.insert(plans).values({
        name: `Invalid Plan ${runId}`,
        code: `invalid-${runId}`,
        billingMode: 'SELF_SERVICE',
        priceCents: -500,
        status: 'ACTIVE',
      }),
    ).rejects.toThrow();
  });

  it('enforces single active platform admin per user via unique partial index', async () => {
    await adminRepo.grantPlatformAdmin({
      userId: testUserId,
      grantedBy: 'smoke_test',
    });

    await expect(
      adminRepo.grantPlatformAdmin({
        userId: testUserId,
        grantedBy: 'smoke_test_dup',
      }),
    ).rejects.toThrow();
  });

  it('enforces ON DELETE RESTRICT on organization when memberships exist', async () => {
    await expect(db.delete(organizations).where(eq(organizations.id, orgAId))).rejects.toThrow();
  });
});
