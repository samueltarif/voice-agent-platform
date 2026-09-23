import { and, eq, lte, or, gt, isNull } from 'drizzle-orm';
import type {
  EntitlementResolver,
  ResolvedNumericEntitlement,
  ResolveEntitlementOptions,
} from '@voice-agent/contracts';
import { ConflictError } from '@voice-agent/errors';
import type { DatabaseInstance } from '../client/connection.js';
import { organizations } from '../schema/organizations.js';
import { commercialGrants, entitlements } from '../schema/commercial.js';
import type { DatabaseExecutor } from './database-executor.js';
import { resolveCommercialPlanSource } from './commercial-plan-source-resolver.js';

interface FeatureOverrideQuery {
  orgId: string;
  key: string;
  at: Date;
}

interface PlanEntitlementQuery {
  planId: string;
  key: string;
  sourceKind: 'PLAN_GRANT' | 'SUBSCRIPTION_PLAN';
}

export class CommercialEntitlementResolver implements EntitlementResolver {
  constructor(private readonly db: DatabaseInstance) {}

  private extractOptions(options?: ResolveEntitlementOptions | Date) {
    if (options instanceof Date) {
      return { at: options, executor: undefined };
    }
    return {
      at: options?.at ?? new Date(),
      executor: options?.executor as DatabaseExecutor | undefined,
    };
  }

  private async isOrgActive(db: DatabaseExecutor, orgId: string): Promise<boolean> {
    const [org] = await db
      .select({ status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return org?.status === 'ACTIVE';
  }

  private async resolveFeatureOverride(
    db: DatabaseExecutor,
    query: FeatureOverrideQuery,
  ): Promise<ResolvedNumericEntitlement | null> {
    const grants = await db
      .select()
      .from(commercialGrants)
      .where(
        and(
          eq(commercialGrants.organizationId, query.orgId),
          eq(commercialGrants.featureKey, query.key),
          lte(commercialGrants.startsAt, query.at),
          or(isNull(commercialGrants.endsAt), gt(commercialGrants.endsAt, query.at)),
        ),
      );

    if (grants.length > 1) {
      throw new ConflictError(
        `Commercial conflict: multiple active feature grants for '${query.key}' in '${query.orgId}'`,
      );
    }
    if (grants.length === 0) return null;

    const rawVal = grants[0]!.overrideValue?.trim();
    if (!rawVal || !/^\d+$/.test(rawVal)) {
      throw new ConflictError(
        `Invalid commercial configuration: feature override '${grants[0]!.overrideValue}' for '${query.key}' is invalid`,
      );
    }
    return {
      granted: true,
      featureKey: query.key,
      limit: parseInt(rawVal, 10),
      sourceKind: 'FEATURE_GRANT',
    };
  }

  private async resolvePlanEntitlement(
    db: DatabaseExecutor,
    query: PlanEntitlementQuery,
  ): Promise<ResolvedNumericEntitlement> {
    const [ent] = await db
      .select()
      .from(entitlements)
      .where(and(eq(entitlements.planId, query.planId), eq(entitlements.featureKey, query.key)))
      .limit(1);

    if (!ent) return { granted: false, featureKey: query.key, limit: null };
    if (ent.valueType !== 'NUMERIC' || ent.numericLimit === null) {
      throw new ConflictError(
        `Commercial configuration error: entitlement for '${query.key}' in '${query.planId}' is not numeric`,
      );
    }
    return {
      granted: true,
      featureKey: query.key,
      limit: ent.numericLimit,
      sourceKind: query.sourceKind,
    };
  }

  async resolveNumericEntitlement(
    organizationId: string,
    featureKey: string,
    options?: ResolveEntitlementOptions | Date,
  ): Promise<ResolvedNumericEntitlement> {
    const { at, executor } = this.extractOptions(options);
    const db = executor ?? this.db;

    if (!(await this.isOrgActive(db, organizationId))) {
      return { granted: false, featureKey, limit: null };
    }

    const override = await this.resolveFeatureOverride(db, {
      orgId: organizationId,
      key: featureKey,
      at,
    });
    if (override) return override;

    const planSource = await resolveCommercialPlanSource(db, organizationId, at);
    if (!planSource) {
      return { granted: false, featureKey, limit: null };
    }

    return this.resolvePlanEntitlement(db, {
      planId: planSource.planId,
      key: featureKey,
      sourceKind: planSource.sourceKind,
    });
  }
}
