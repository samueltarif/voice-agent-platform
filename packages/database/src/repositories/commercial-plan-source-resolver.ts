import { and, eq, lte, or, gt, isNull } from 'drizzle-orm';
import { ConflictError } from '@voice-agent/errors';
import { commercialGrants, subscriptions } from '../schema/commercial.js';
import type { DatabaseExecutor } from './database-executor.js';

export interface PlanSourceResult {
  planId: string;
  sourceKind: 'PLAN_GRANT' | 'SUBSCRIPTION_PLAN';
}

export async function resolveCommercialPlanSource(
  db: DatabaseExecutor,
  orgId: string,
  at: Date,
): Promise<PlanSourceResult | null> {
  const grants = await db
    .select()
    .from(commercialGrants)
    .where(
      and(
        eq(commercialGrants.organizationId, orgId),
        lte(commercialGrants.startsAt, at),
        or(isNull(commercialGrants.endsAt), gt(commercialGrants.endsAt, at)),
      ),
    );
  const planGrants = grants.filter((g) => g.planId !== null);
  if (planGrants.length > 1) {
    throw new ConflictError(
      `Commercial conflict: multiple active plan grants found for organization '${orgId}'`,
    );
  }
  if (planGrants.length === 1) {
    return { planId: planGrants[0]!.planId!, sourceKind: 'PLAN_GRANT' };
  }

  const subs = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, orgId),
        or(eq(subscriptions.status, 'TRIALING'), eq(subscriptions.status, 'ACTIVE')),
        lte(subscriptions.currentPeriodStart, at),
        gt(subscriptions.currentPeriodEnd, at),
      ),
    );
  if (subs.length > 1) {
    throw new ConflictError(
      `Commercial conflict: multiple eligible subscriptions for organization '${orgId}'`,
    );
  }
  if (subs.length === 1) {
    return { planId: subs[0]!.planId, sourceKind: 'SUBSCRIPTION_PLAN' };
  }
  return null;
}
