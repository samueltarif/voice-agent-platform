import { and, asc, eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import {
  organizations,
  organizationMemberships,
  type TenantRole,
} from '../schema/organizations.js';

export interface UserOrganizationContextItem {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly role: TenantRole;
}

export interface FindActiveOrganizationBySlugInput {
  readonly userId: string;
  readonly slug: string;
}

export class UserOrganizationContextRepository {
  constructor(private readonly db: DatabaseInstance) {}

  async listActiveOrganizationsForUser(userId: string): Promise<UserOrganizationContextItem[]> {
    const rows = await this.db
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        role: organizationMemberships.role,
      })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
      .where(
        and(
          eq(organizationMemberships.userId, userId),
          eq(organizationMemberships.status, 'ACTIVE'),
          eq(organizations.status, 'ACTIVE'),
        ),
      )
      .orderBy(asc(organizations.name), asc(organizations.id));

    return rows;
  }

  async findActiveOrganizationBySlugForUser(
    input: FindActiveOrganizationBySlugInput,
  ): Promise<UserOrganizationContextItem | null> {
    const [row] = await this.db
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        role: organizationMemberships.role,
      })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
      .where(
        and(
          eq(organizations.slug, input.slug),
          eq(organizations.status, 'ACTIVE'),
          eq(organizationMemberships.userId, input.userId),
          eq(organizationMemberships.status, 'ACTIVE'),
        ),
      )
      .limit(1);

    return row ?? null;
  }
}
