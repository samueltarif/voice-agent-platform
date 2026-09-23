export type EntitlementSourceKind = 'FEATURE_GRANT' | 'PLAN_GRANT' | 'SUBSCRIPTION_PLAN';

export interface ResolvedNumericEntitlement {
  granted: boolean;
  featureKey: string;
  limit: number | null;
  sourceKind?: EntitlementSourceKind | undefined;
}

export interface ResolveEntitlementOptions {
  at?: Date | undefined;
  executor?: unknown;
}

/**
 * Port/Interface for Commercial Publication Eligibility Policy.
 * ADR-011 requires verifying commercial regularity prior to publishing an agent version:
 * Organization ACTIVE + effective agents.max granted and > 0.
 */
export interface CommercialPublicationPolicy {
  assertEligibleForPublish(
    organizationId: string,
    options?: ResolveEntitlementOptions,
  ): Promise<void>;
}

/**
 * Port/Interface for Entitlement Resolution.
 * Resolves commercial quota and limits (such as agents.max) for a given tenant organization.
 * Implements deterministic 4-step precedence with fail-closed conflict handling (ADR-011).
 */
export interface EntitlementResolver {
  resolveNumericEntitlement(
    organizationId: string,
    featureKey: string,
    options?: ResolveEntitlementOptions | Date,
  ): Promise<ResolvedNumericEntitlement>;
}
