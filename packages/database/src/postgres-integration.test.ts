import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseConnection } from './client/connection.js';
import { OrganizationRepository } from './repositories/organization-repository.js';
import { MembershipRepository } from './repositories/membership-repository.js';
import { PlatformAdminRepository } from './repositories/platform-admin-repository.js';
import { CommercialRepository } from './repositories/commercial-repository.js';
import { user } from './schema/auth.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('PostgreSQL Multi-Tenant and Auth Isolation (Integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const orgRepo = new OrganizationRepository(db);
  const memberRepo = new MembershipRepository(db);
  const platformRepo = new PlatformAdminRepository(db);
  const commercialRepo = new CommercialRepository(db);

  const testSuffix = Math.random().toString(36).substring(2, 8);
  const userIdA = `usr_test_a_${testSuffix}`;
  const userIdB = `usr_test_b_${testSuffix}`;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    await db.insert(user).values([
      { id: userIdA, name: 'User A', email: `usera_${testSuffix}@example.com` },
      { id: userIdB, name: 'User B', email: `userb_${testSuffix}@example.com` },
    ]);

    const orgA = await orgRepo.createOrganization({
      slug: `org-a-${testSuffix}`,
      name: `Organization A ${testSuffix}`,
    });
    const orgB = await orgRepo.createOrganization({
      slug: `org-b-${testSuffix}`,
      name: `Organization B ${testSuffix}`,
    });
    if (!orgA || !orgB) {
      throw new Error('Failed to create test organizations');
    }
    orgAId = orgA.id;
    orgBId = orgB.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('enforces tenant boundary: Org A cannot read Org B memberships', async () => {
    await memberRepo.createMembership({
      organizationId: orgAId,
      userId: userIdA,
      role: 'OWNER',
    });
    await memberRepo.createMembership({
      organizationId: orgBId,
      userId: userIdB,
      role: 'ADMIN',
    });

    const orgAMembers = await memberRepo.listMemberships({ organizationId: orgAId });
    expect(orgAMembers.length).toBe(1);
    expect(orgAMembers[0]?.userId).toBe(userIdA);

    const crossTenantRead = await memberRepo.findMembership({
      organizationId: orgAId,
      userId: userIdB,
    });
    expect(crossTenantRead).toBeNull();
  });

  it('enforces unique constraint per organization and user', async () => {
    await expect(
      memberRepo.createMembership({
        organizationId: orgAId,
        userId: userIdA,
        role: 'OPERATOR',
      }),
    ).rejects.toThrow();
  });

  it('keeps Platform Admin authorization strictly separated from tenant roles', async () => {
    const beforeGrant = await platformRepo.findActiveAuthorizationByUserId({ userId: userIdA });
    expect(beforeGrant).toBeNull();

    await platformRepo.grantPlatformAdmin({
      userId: userIdA,
      grantedBy: 'system_provisioning',
    });

    const activeAuth = await platformRepo.findActiveAuthorizationByUserId({ userId: userIdA });
    expect(activeAuth?.status).toBe('ACTIVE');

    await platformRepo.revokePlatformAdmin({
      userId: userIdA,
      revokedBy: 'security_auditor',
    });

    const afterRevocation = await platformRepo.findActiveAuthorizationByUserId({ userId: userIdA });
    expect(afterRevocation).toBeNull();
  });

  it('enforces tenant-scoped subscriptions and commercial grants', async () => {
    const plan = await commercialRepo.createPlan({
      code: `plan_${testSuffix}`,
      name: 'Starter Plan',
      billingMode: 'SELF_SERVICE',
    });
    if (!plan) {
      throw new Error('Failed to create test plan');
    }

    await commercialRepo.createSubscription({
      organizationId: orgAId,
      planId: plan.id,
      status: 'ACTIVE',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 86400000 * 30),
    });

    const orgASubscription = await commercialRepo.findActiveSubscription({
      organizationId: orgAId,
    });
    expect(orgASubscription).not.toBeNull();
    expect(orgASubscription?.organizationId).toBe(orgAId);

    const orgBSubscription = await commercialRepo.findActiveSubscription({
      organizationId: orgBId,
    });
    expect(orgBSubscription).toBeNull();
  });
});
