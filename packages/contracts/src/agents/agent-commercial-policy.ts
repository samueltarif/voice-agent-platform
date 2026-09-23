/**
 * Port/Interface for Commercial Publication Eligibility Policy.
 * ADR-009 requires verifying commercial regularity prior to publishing an agent version.
 * Separated explicitly so domain publishing logic is decoupled from commercial status rules.
 */
export interface CommercialPublicationPolicy {
  assertEligibleForPublish(organizationId: string): Promise<void>;
}

/**
 * Port/Interface for Entitlement Resolution.
 * Resolves commercial quota and limits (such as agents.max) for a given tenant organization.
 */
export interface EntitlementResolver {
  resolveNumericLimit(organizationId: string, featureKey: string): Promise<number | null>;
}
