import { and, eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import {
  organizationMemberships,
  type TenantRole,
  type MembershipStatus,
} from '../schema/organizations.js';

export interface CreateMembershipInput {
  organizationId: string;
  userId: string;
  role: TenantRole;
  status: MembershipStatus;
}

export interface FindMembershipInput {
  organizationId: string;
  userId: string;
}

export interface FindMembershipByIdInput {
  organizationId: string;
  id: string;
}

export interface ListMembershipsInput {
  organizationId: string;
}

export interface UpdateMembershipRoleInput {
  organizationId: string;
  userId: string;
  role: TenantRole;
}

export interface UpdateMembershipStatusInput {
  organizationId: string;
  userId: string;
  status: MembershipStatus;
}

export class MembershipRepository {
  constructor(private readonly db: DatabaseInstance) {}

  async createMembership(input: CreateMembershipInput) {
    const [created] = await this.db
      .insert(organizationMemberships)
      .values({
        organizationId: input.organizationId,
        userId: input.userId,
        role: input.role,
        status: input.status,
      })
      .returning();

    return created;
  }

  async findMembership(input: FindMembershipInput) {
    const [found] = await this.db
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, input.organizationId),
          eq(organizationMemberships.userId, input.userId),
        ),
      )
      .limit(1);

    return found ?? null;
  }

  async findMembershipById(input: FindMembershipByIdInput) {
    const [found] = await this.db
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, input.organizationId),
          eq(organizationMemberships.id, input.id),
        ),
      )
      .limit(1);

    return found ?? null;
  }

  async listMemberships(input: ListMembershipsInput) {
    return this.db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.organizationId, input.organizationId));
  }

  async updateMembershipRole(input: UpdateMembershipRoleInput) {
    const [updated] = await this.db
      .update(organizationMemberships)
      .set({ role: input.role })
      .where(
        and(
          eq(organizationMemberships.organizationId, input.organizationId),
          eq(organizationMemberships.userId, input.userId),
        ),
      )
      .returning();

    return updated ?? null;
  }

  async updateMembershipStatus(input: UpdateMembershipStatusInput) {
    const [updated] = await this.db
      .update(organizationMemberships)
      .set({ status: input.status })
      .where(
        and(
          eq(organizationMemberships.organizationId, input.organizationId),
          eq(organizationMemberships.userId, input.userId),
        ),
      )
      .returning();

    return updated ?? null;
  }
}
