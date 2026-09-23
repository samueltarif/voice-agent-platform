import { and, eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import {
  plans,
  entitlements,
  subscriptions,
  commercialGrants,
  type BillingMode,
  type PlanStatus,
  type EntitlementValueType,
  type SubscriptionStatus,
} from '../schema/commercial.js';

export interface CreatePlanInput {
  code: string;
  name: string;
  description?: string | undefined;
  billingMode: BillingMode;
  priceCents?: number | undefined;
  currency?: string | undefined;
  status?: PlanStatus | undefined;
}

export interface CreateEntitlementInput {
  planId: string;
  featureKey: string;
  valueType: EntitlementValueType;
  booleanValue?: boolean | undefined;
  numericLimit?: number | undefined;
  stringValue?: string | undefined;
}

export interface CreateSubscriptionInput {
  organizationId: string;
  planId: string;
  status: SubscriptionStatus;
  billingMode: BillingMode;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

export interface CreateCommercialGrantInput {
  organizationId: string;
  planId?: string | undefined;
  featureKey?: string | undefined;
  overrideValue?: string | undefined;
  startsAt?: Date | undefined;
  endsAt?: Date | undefined;
  grantedBy: string;
  reason: string;
  reference?: string | undefined;
}

export class CommercialRepository {
  constructor(private readonly db: DatabaseInstance) {}

  async createPlan(input: CreatePlanInput) {
    const [created] = await this.db.insert(plans).values(input).returning();
    return created;
  }

  async findPlanByCode(input: { code: string }) {
    const [found] = await this.db.select().from(plans).where(eq(plans.code, input.code)).limit(1);
    return found ?? null;
  }

  async createEntitlement(input: CreateEntitlementInput) {
    const [created] = await this.db.insert(entitlements).values(input).returning();
    return created;
  }

  async listEntitlementsByPlan(input: { planId: string }) {
    return this.db.select().from(entitlements).where(eq(entitlements.planId, input.planId));
  }

  async createSubscription(input: CreateSubscriptionInput) {
    const [created] = await this.db.insert(subscriptions).values(input).returning();
    return created;
  }

  async findActiveSubscription(input: { organizationId: string }) {
    const [found] = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.organizationId, input.organizationId),
          eq(subscriptions.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    return found ?? null;
  }

  async createCommercialGrant(input: CreateCommercialGrantInput) {
    const [created] = await this.db.insert(commercialGrants).values(input).returning();
    return created;
  }

  async listCommercialGrants(input: { organizationId: string }) {
    return this.db
      .select()
      .from(commercialGrants)
      .where(eq(commercialGrants.organizationId, input.organizationId));
  }
}
