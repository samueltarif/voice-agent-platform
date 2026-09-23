import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDatabaseConnection } from './client/connection.js';
import { OrganizationRepository } from './repositories/organization-repository.js';
import { MembershipRepository } from './repositories/membership-repository.js';
import { PlatformAdminRepository } from './repositories/platform-admin-repository.js';
import { CommercialRepository } from './repositories/commercial-repository.js';
import { AuditRepository } from './repositories/audit-repository.js';
import { user } from './schema/auth.js';
import { organizations } from './schema/organizations.js';
import { plans, entitlements, commercialGrants } from './schema/commercial.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('PostgreSQL Integrity, Constraints and Isolation (Integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const orgRepo = new OrganizationRepository(db);
  const memberRepo = new MembershipRepository(db);
  const platformRepo = new PlatformAdminRepository(db);
  const commercialRepo = new CommercialRepository(db);
  const auditRepo = new AuditRepository(db);

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
      status: 'ACTIVE',
    });
    const orgB = await orgRepo.createOrganization({
      slug: `org-b-${testSuffix}`,
      name: `Organization B ${testSuffix}`,
      status: 'ACTIVE',
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
      status: 'ACTIVE',
    });
    await memberRepo.createMembership({
      organizationId: orgBId,
      userId: userIdB,
      role: 'ADMIN',
      status: 'ACTIVE',
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

  it('rejects invalid membership role via PostgreSQL enum', async () => {
    await expect(
      db.execute(
        sql`INSERT INTO organization_memberships (organization_id, user_id, role, status)
            VALUES (${orgAId}, ${userIdB}, 'SUPERUSER'::tenant_role, 'ACTIVE')`,
      ),
    ).rejects.toThrow();
  });

  it('rejects invalid membership status via PostgreSQL enum', async () => {
    await expect(
      db.execute(
        sql`INSERT INTO organization_memberships (organization_id, user_id, role, status)
            VALUES (${orgAId}, ${userIdB}, 'VIEWER', 'DELETED'::membership_status)`,
      ),
    ).rejects.toThrow();
  });

  it('enforces unique constraint per organization and user', async () => {
    await expect(
      memberRepo.createMembership({
        organizationId: orgAId,
        userId: userIdA,
        role: 'OPERATOR',
        status: 'ACTIVE',
      }),
    ).rejects.toThrow();
  });

  it('enforces single ACTIVE Platform Admin via unique partial index', async () => {
    await platformRepo.grantPlatformAdmin({
      userId: userIdA,
      grantedBy: 'system_provisioning',
    });

    // Attempting a second ACTIVE grant for the same user must be rejected
    await expect(
      platformRepo.grantPlatformAdmin({
        userId: userIdA,
        grantedBy: 'admin_duplicate_attempt',
      }),
    ).rejects.toThrow();

    // Revoking the grant allows a subsequent ACTIVE grant
    await platformRepo.revokePlatformAdmin({
      userId: userIdA,
      revokedBy: 'security_auditor',
    });

    const secondGrant = await platformRepo.grantPlatformAdmin({
      userId: userIdA,
      grantedBy: 're_grant_provisioner',
    });
    expect(secondGrant?.status).toBe('ACTIVE');

    // Clean up
    await platformRepo.revokePlatformAdmin({
      userId: userIdA,
      revokedBy: 'cleanup',
    });
  });

  it('rejects entitlement incompatible values and negative limits', async () => {
    const plan = await commercialRepo.createPlan({
      code: `plan_ent_${testSuffix}`,
      name: 'Entitlement Test Plan',
      billingMode: 'SELF_SERVICE',
      priceCents: 1000,
    });
    if (!plan) throw new Error('Plan creation failed');

    // Valid BOOLEAN entitlement
    await commercialRepo.createEntitlement({
      planId: plan.id,
      featureKey: 'feature_bool',
      valueType: 'BOOLEAN',
      booleanValue: true,
    });

    // Incompatible: BOOLEAN with booleanValue null
    await expect(
      db.insert(entitlements).values({
        planId: plan.id,
        featureKey: 'feature_invalid_bool',
        valueType: 'BOOLEAN',
        booleanValue: null,
      }),
    ).rejects.toThrow();

    // Incompatible: NUMERIC with negative limit
    await expect(
      db.insert(entitlements).values({
        planId: plan.id,
        featureKey: 'feature_invalid_num',
        valueType: 'NUMERIC',
        numericLimit: -5,
      }),
    ).rejects.toThrow();

    // Incompatible: STRING with booleanValue populated
    await expect(
      db.insert(entitlements).values({
        planId: plan.id,
        featureKey: 'feature_invalid_str',
        valueType: 'STRING',
        stringValue: 'custom',
        booleanValue: true,
      }),
    ).rejects.toThrow();
  });

  it('rejects commercial grants without effect or with invalid period', async () => {
    // Empty effect: both planId and featureKey/overrideValue are null
    await expect(
      db.insert(commercialGrants).values({
        organizationId: orgAId,
        grantedBy: 'admin',
        reason: 'test empty',
      }),
    ).rejects.toThrow();

    // Invalid period: endsAt earlier than startsAt
    const now = new Date();
    const past = new Date(now.getTime() - 86400000);
    await expect(
      db.insert(commercialGrants).values({
        organizationId: orgAId,
        featureKey: 'bonus_calls',
        overrideValue: '500',
        startsAt: now,
        endsAt: past,
        grantedBy: 'admin',
        reason: 'test invalid period',
      }),
    ).rejects.toThrow();

    // Valid grant with effect and valid period
    const validGrant = await commercialRepo.createCommercialGrant({
      organizationId: orgAId,
      featureKey: 'bonus_calls',
      overrideValue: '500',
      startsAt: now,
      endsAt: new Date(now.getTime() + 86400000),
      grantedBy: 'admin',
      reason: 'partnership promo',
    });
    expect(validGrant).toBeDefined();
    expect(validGrant?.overrideValue).toBe('500');
  });

  it('rejects subscriptions with invalid periods or negative prices', async () => {
    const plan = await commercialRepo.createPlan({
      code: `plan_sub_${testSuffix}`,
      name: 'Subscription Test Plan',
      billingMode: 'SELF_SERVICE',
      priceCents: 5000,
    });
    if (!plan) throw new Error('Plan creation failed');

    // Invalid period: end earlier than start
    const now = new Date();
    const past = new Date(now.getTime() - 3600000);
    await expect(
      commercialRepo.createSubscription({
        organizationId: orgAId,
        planId: plan.id,
        status: 'ACTIVE',
        billingMode: 'SELF_SERVICE',
        currentPeriodStart: now,
        currentPeriodEnd: past,
      }),
    ).rejects.toThrow();

    // Negative plan price check
    await expect(
      db.insert(plans).values({
        code: `plan_neg_${testSuffix}`,
        name: 'Negative Plan',
        billingMode: 'SELF_SERVICE',
        priceCents: -100,
      }),
    ).rejects.toThrow();
  });

  it('prevents accidental organization deletion via ON DELETE RESTRICT', async () => {
    const testOrg = await orgRepo.createOrganization({
      slug: `org-del-${testSuffix}`,
      name: `Org Delete Test ${testSuffix}`,
    });
    if (!testOrg) throw new Error('Org creation failed');

    await auditRepo.createAuditLog({
      organizationId: testOrg.id,
      actorId: userIdA,
      action: 'ORG_CREATED',
      targetType: 'ORGANIZATION',
      targetId: testOrg.id,
    });

    // Deleting organization while audit logs exist must be blocked by RESTRICT
    await expect(
      db.delete(organizations).where(sql`${organizations.id} = ${testOrg.id}`),
    ).rejects.toThrow();
  });
});
