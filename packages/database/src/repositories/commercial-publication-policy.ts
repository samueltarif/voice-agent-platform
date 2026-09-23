import { eq } from 'drizzle-orm';
import type {
  CommercialPublicationPolicy,
  EntitlementResolver,
  ResolveEntitlementOptions,
} from '@voice-agent/contracts';
import { CommercialAccessDeniedError } from '@voice-agent/errors';
import type { DatabaseInstance } from '../client/connection.js';
import { organizations } from '../schema/organizations.js';
import type { DatabaseExecutor } from './database-executor.js';

export class DefaultCommercialPublicationPolicy implements CommercialPublicationPolicy {
  constructor(
    private readonly db: DatabaseInstance,
    private readonly entitlementResolver: EntitlementResolver,
  ) {}

  private extractContext(options?: ResolveEntitlementOptions | Date) {
    if (options instanceof Date) {
      return { opts: { at: options }, db: this.db };
    }
    const executor = options?.executor as DatabaseExecutor | undefined;
    return { opts: options, db: executor ?? this.db };
  }

  private async assertOrgActive(db: DatabaseExecutor, orgId: string): Promise<void> {
    const [org] = await db
      .select({ status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org || org.status !== 'ACTIVE') {
      throw new CommercialAccessDeniedError(
        `Commercial publication denied: organization '${orgId}' is not active`,
      );
    }
  }

  private async assertQuotaPositive(
    orgId: string,
    opts?: ResolveEntitlementOptions,
  ): Promise<void> {
    const entitlement = await this.entitlementResolver.resolveNumericEntitlement(
      orgId,
      'agents.max',
      opts,
    );

    if (!entitlement.granted || entitlement.limit === null) {
      throw new CommercialAccessDeniedError(
        `Commercial publication denied: agents.max entitlement is not granted for organization '${orgId}'`,
      );
    }

    if (entitlement.limit <= 0) {
      throw new CommercialAccessDeniedError(
        `Commercial publication denied: agents.max limit must be greater than zero (current: ${entitlement.limit})`,
      );
    }
  }

  async assertEligibleForPublish(
    organizationId: string,
    options?: ResolveEntitlementOptions | Date,
  ): Promise<void> {
    const { opts, db } = this.extractContext(options);
    await this.assertOrgActive(db, organizationId);
    await this.assertQuotaPositive(organizationId, opts);
  }
}
