import { and, eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import { platformAdminAuthorizations } from '../schema/platform-admin.js';

export interface GrantPlatformAdminInput {
  userId: string;
  grantedBy: string;
}

export interface FindActivePlatformAdminInput {
  userId: string;
}

export interface RevokePlatformAdminInput {
  userId: string;
  revokedBy: string;
}

export class PlatformAdminRepository {
  constructor(private readonly db: DatabaseInstance) {}

  async grantPlatformAdmin(input: GrantPlatformAdminInput) {
    const [granted] = await this.db
      .insert(platformAdminAuthorizations)
      .values({
        userId: input.userId,
        grantedBy: input.grantedBy,
        status: 'ACTIVE',
      })
      .returning();

    return granted;
  }

  async findActiveAuthorizationByUserId(input: FindActivePlatformAdminInput) {
    const [found] = await this.db
      .select()
      .from(platformAdminAuthorizations)
      .where(
        and(
          eq(platformAdminAuthorizations.userId, input.userId),
          eq(platformAdminAuthorizations.status, 'ACTIVE'),
        ),
      )
      .limit(1);

    return found ?? null;
  }

  async revokePlatformAdmin(input: RevokePlatformAdminInput) {
    const [revoked] = await this.db
      .update(platformAdminAuthorizations)
      .set({
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedBy: input.revokedBy,
      })
      .where(
        and(
          eq(platformAdminAuthorizations.userId, input.userId),
          eq(platformAdminAuthorizations.status, 'ACTIVE'),
        ),
      )
      .returning();

    return revoked ?? null;
  }

  async listActivePlatformAdmins() {
    return this.db
      .select()
      .from(platformAdminAuthorizations)
      .where(eq(platformAdminAuthorizations.status, 'ACTIVE'));
  }
}
