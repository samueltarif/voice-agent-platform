import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ConflictError } from '@voice-agent/errors';
import { createDatabaseConnection } from './client/connection.js';
import { CommercialEntitlementResolver } from './repositories/commercial-entitlement-resolver.js';
import { organizations } from './schema/organizations.js';
import { plans, entitlements, subscriptions, commercialGrants } from './schema/commercial.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('CommercialEntitlementResolver (Multiple Sources Integration Tests)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const resolver = new CommercialEntitlementResolver(db);

  const testSuffix = Math.random().toString(36).substring(2, 8);
  const now = new Date('2026-09-23T12:00:00Z');
  const past = new Date('2026-09-01T00:00:00Z');
  const future = new Date('2026-10-01T00:00:00Z');
  const wayFuture = new Date('2026-12-31T23:59:59Z');

  let planStandardId: string;
  let planProId: string;
  let planZeroId: string;
  let planMissingId: string;
  let planArchivedId: string;

  beforeAll(async () => {
    // 1. Seed plans
    const [standard] = await db
      .insert(plans)
      .values({
        code: `standard-${testSuffix}`,
        name: 'Standard Plan',
        billingMode: 'SELF_SERVICE',
        status: 'ACTIVE',
      })
      .returning();
    planStandardId = standard!.id;

    const [pro] = await db
      .insert(plans)
      .values({
        code: `pro-${testSuffix}`,
        name: 'Pro Plan',
        billingMode: 'MANUAL',
        status: 'ACTIVE',
      })
      .returning();
    planProId = pro!.id;

    const [zero] = await db
      .insert(plans)
      .values({
        code: `zero-${testSuffix}`,
        name: 'Zero Limit Plan',
        billingMode: 'COMPLIMENTARY',
        status: 'ACTIVE',
      })
      .returning();
    planZeroId = zero!.id;

    const [missing] = await db
      .insert(plans)
      .values({
        code: `missing-${testSuffix}`,
        name: 'Missing Entitlements Plan',
        billingMode: 'SELF_SERVICE',
        status: 'ACTIVE',
      })
      .returning();
    planMissingId = missing!.id;

    const [archived] = await db
      .insert(plans)
      .values({
        code: `archived-${testSuffix}`,
        name: 'Archived Plan',
        billingMode: 'MANUAL',
        status: 'ARCHIVED',
      })
      .returning();
    planArchivedId = archived!.id;

    // 2. Seed entitlements
    await db.insert(entitlements).values([
      {
        planId: planStandardId,
        featureKey: 'agents.max',
        valueType: 'NUMERIC',
        numericLimit: 5,
      },
      {
        planId: planProId,
        featureKey: 'agents.max',
        valueType: 'NUMERIC',
        numericLimit: 10,
      },
      {
        planId: planZeroId,
        featureKey: 'agents.max',
        valueType: 'NUMERIC',
        numericLimit: 0,
      },
      {
        planId: planArchivedId,
        featureKey: 'agents.max',
        valueType: 'NUMERIC',
        numericLimit: 7,
      },
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createTestOrg(status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' = 'ACTIVE') {
    const slug = `org-res-${Math.random().toString(36).substring(2, 8)}`;
    const [org] = await db
      .insert(organizations)
      .values({ name: `Test Org ${slug}`, slug, status })
      .returning();
    return org!;
  }

  it('subscription ACTIVE provides agents.max', async () => {
    const org = await createTestOrg();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planStandardId,
      status: 'ACTIVE',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: past,
      currentPeriodEnd: future,
    });

    const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
    expect(res.granted).toBe(true);
    expect(res.limit).toBe(5);
    expect(res.sourceKind).toBe('SUBSCRIPTION_PLAN');
  });

  it('subscription TRIALING provides agents.max', async () => {
    const org = await createTestOrg();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planStandardId,
      status: 'TRIALING',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: past,
      currentPeriodEnd: future,
    });

    const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
    expect(res.granted).toBe(true);
    expect(res.limit).toBe(5);
    expect(res.sourceKind).toBe('SUBSCRIPTION_PLAN');
  });

  it('PAST_DUE alone denies entitlement', async () => {
    const org = await createTestOrg();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planStandardId,
      status: 'PAST_DUE',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: past,
      currentPeriodEnd: future,
    });

    const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
    expect(res.granted).toBe(false);
    expect(res.limit).toBeNull();
  });

  it('SUSPENDED, CANCELED, EXPIRED subscriptions deny entitlement', async () => {
    for (const status of ['SUSPENDED', 'CANCELED', 'EXPIRED'] as const) {
      const org = await createTestOrg();
      await db.insert(subscriptions).values({
        organizationId: org.id,
        planId: planStandardId,
        status,
        billingMode: 'SELF_SERVICE',
        currentPeriodStart: past,
        currentPeriodEnd: future,
      });

      const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
      expect(res.granted).toBe(false);
    }
  });

  it('period expired denies even if status is ACTIVE', async () => {
    const org = await createTestOrg();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planStandardId,
      status: 'ACTIVE',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: new Date('2026-08-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-09-01T00:00:00Z'), // expired relative to now (2026-09-23)
    });

    const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
    expect(res.granted).toBe(false);
  });

  it('cancel_at_period_end maintains access before period_end', async () => {
    const org = await createTestOrg();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planStandardId,
      status: 'ACTIVE',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: past,
      currentPeriodEnd: future,
      cancelAtPeriodEnd: true,
    });

    const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
    expect(res.granted).toBe(true);
    expect(res.limit).toBe(5);
  });

  it('active feature grant override beats subscription', async () => {
    const org = await createTestOrg();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planStandardId, // limit 5
      status: 'ACTIVE',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: past,
      currentPeriodEnd: future,
    });
    await db.insert(commercialGrants).values({
      organizationId: org.id,
      featureKey: 'agents.max',
      overrideValue: '8',
      startsAt: past,
      endsAt: future,
      grantedBy: 'admin_1',
      reason: 'Special customer expansion',
    });

    const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
    expect(res.granted).toBe(true);
    expect(res.limit).toBe(8);
    expect(res.sourceKind).toBe('FEATURE_GRANT');
  });

  it('feature grant works without subscription', async () => {
    const org = await createTestOrg();
    await db.insert(commercialGrants).values({
      organizationId: org.id,
      featureKey: 'agents.max',
      overrideValue: '3',
      startsAt: past,
      endsAt: null, // indefinite
      grantedBy: 'admin_1',
      reason: 'Complimentary grant',
    });

    const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
    expect(res.granted).toBe(true);
    expect(res.limit).toBe(3);
    expect(res.sourceKind).toBe('FEATURE_GRANT');
  });

  it('plan grant beats subscription', async () => {
    const org = await createTestOrg();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planStandardId, // limit 5
      status: 'ACTIVE',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: past,
      currentPeriodEnd: future,
    });
    await db.insert(commercialGrants).values({
      organizationId: org.id,
      planId: planProId, // limit 10
      startsAt: past,
      endsAt: future,
      grantedBy: 'admin_1',
      reason: 'Upgrade grant',
    });

    const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
    expect(res.granted).toBe(true);
    expect(res.limit).toBe(10);
    expect(res.sourceKind).toBe('PLAN_GRANT');
  });

  it('active grant works when subscription is PAST_DUE', async () => {
    const org = await createTestOrg();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planStandardId,
      status: 'PAST_DUE',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: past,
      currentPeriodEnd: future,
    });
    await db.insert(commercialGrants).values({
      organizationId: org.id,
      planId: planProId,
      startsAt: past,
      endsAt: future,
      grantedBy: 'admin_1',
      reason: 'Grace period grant',
    });

    const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
    expect(res.granted).toBe(true);
    expect(res.limit).toBe(10);
    expect(res.sourceKind).toBe('PLAN_GRANT');
  });

  it('grant not yet started is ignored', async () => {
    const org = await createTestOrg();
    await db.insert(commercialGrants).values({
      organizationId: org.id,
      featureKey: 'agents.max',
      overrideValue: '12',
      startsAt: future, // starts in future
      endsAt: wayFuture,
      grantedBy: 'admin_1',
      reason: 'Future grant',
    });

    const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
    expect(res.granted).toBe(false);
  });

  it('grant expired is ignored', async () => {
    const org = await createTestOrg();
    await db.insert(commercialGrants).values({
      organizationId: org.id,
      featureKey: 'agents.max',
      overrideValue: '12',
      startsAt: new Date('2026-08-01T00:00:00Z'),
      endsAt: new Date('2026-09-01T00:00:00Z'), // expired before now
      grantedBy: 'admin_1',
      reason: 'Past grant',
    });

    const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
    expect(res.granted).toBe(false);
  });

  it('2 active feature overrides => fails closed with ConflictError', async () => {
    const org = await createTestOrg();
    await db.insert(commercialGrants).values([
      {
        organizationId: org.id,
        featureKey: 'agents.max',
        overrideValue: '4',
        startsAt: past,
        endsAt: future,
        grantedBy: 'admin_1',
        reason: 'Grant 1',
      },
      {
        organizationId: org.id,
        featureKey: 'agents.max',
        overrideValue: '6',
        startsAt: past,
        endsAt: future,
        grantedBy: 'admin_2',
        reason: 'Grant 2',
      },
    ]);

    await expect(resolver.resolveNumericEntitlement(org.id, 'agents.max', now)).rejects.toThrow(
      ConflictError,
    );
  });

  it('2 active plan grants => fails closed with ConflictError', async () => {
    const org = await createTestOrg();
    await db.insert(commercialGrants).values([
      {
        organizationId: org.id,
        planId: planStandardId,
        startsAt: past,
        endsAt: future,
        grantedBy: 'admin_1',
        reason: 'Plan Grant 1',
      },
      {
        organizationId: org.id,
        planId: planProId,
        startsAt: past,
        endsAt: future,
        grantedBy: 'admin_2',
        reason: 'Plan Grant 2',
      },
    ]);

    await expect(resolver.resolveNumericEntitlement(org.id, 'agents.max', now)).rejects.toThrow(
      ConflictError,
    );
  });

  it('2 eligible subscriptions => fails closed with ConflictError', async () => {
    const org = await createTestOrg();
    await db.insert(subscriptions).values([
      {
        organizationId: org.id,
        planId: planStandardId,
        status: 'ACTIVE',
        billingMode: 'SELF_SERVICE',
        currentPeriodStart: past,
        currentPeriodEnd: future,
      },
      {
        organizationId: org.id,
        planId: planProId,
        status: 'TRIALING',
        billingMode: 'SELF_SERVICE',
        currentPeriodStart: past,
        currentPeriodEnd: future,
      },
    ]);

    await expect(resolver.resolveNumericEntitlement(org.id, 'agents.max', now)).rejects.toThrow(
      ConflictError,
    );
  });

  it('invalid agents.max override values fail closed with ConflictError', async () => {
    for (const invalidVal of ['cinco', '5.5', '-1', '', 'NaN']) {
      const org = await createTestOrg();
      await db.insert(commercialGrants).values({
        organizationId: org.id,
        featureKey: 'agents.max',
        overrideValue: invalidVal,
        startsAt: past,
        endsAt: future,
        grantedBy: 'admin_1',
        reason: 'Invalid val',
      });

      await expect(resolver.resolveNumericEntitlement(org.id, 'agents.max', now)).rejects.toThrow(
        ConflictError,
      );
    }
  });

  it('override 0 => entitlement granted with limit 0', async () => {
    const org = await createTestOrg();
    await db.insert(commercialGrants).values({
      organizationId: org.id,
      featureKey: 'agents.max',
      overrideValue: '0',
      startsAt: past,
      endsAt: future,
      grantedBy: 'admin_1',
      reason: 'Zero override',
    });

    const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
    expect(res.granted).toBe(true);
    expect(res.limit).toBe(0);
    expect(res.sourceKind).toBe('FEATURE_GRANT');
  });

  it('archived plan already referenced by active subscription continues resolvable', async () => {
    const org = await createTestOrg();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planArchivedId, // status ARCHIVED, limit 7
      status: 'ACTIVE',
      billingMode: 'MANUAL',
      currentPeriodStart: past,
      currentPeriodEnd: future,
    });

    const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
    expect(res.granted).toBe(true);
    expect(res.limit).toBe(7);
  });

  it('missing agents.max entitlement in plan => not granted', async () => {
    const org = await createTestOrg();
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: planMissingId, // no agents.max entitlement
      status: 'ACTIVE',
      billingMode: 'SELF_SERVICE',
      currentPeriodStart: past,
      currentPeriodEnd: future,
    });

    const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
    expect(res.granted).toBe(false);
    expect(res.limit).toBeNull();
  });

  it('organization SUSPENDED or ARCHIVED denies entitlement immediately', async () => {
    for (const status of ['SUSPENDED', 'ARCHIVED'] as const) {
      const org = await createTestOrg(status);
      await db.insert(subscriptions).values({
        organizationId: org.id,
        planId: planStandardId,
        status: 'ACTIVE',
        billingMode: 'SELF_SERVICE',
        currentPeriodStart: past,
        currentPeriodEnd: future,
      });

      const res = await resolver.resolveNumericEntitlement(org.id, 'agents.max', now);
      expect(res.granted).toBe(false);
    }
  });
});
