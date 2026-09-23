import { eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import { organizations, type OrganizationStatus } from '../schema/organizations.js';

export interface CreateOrganizationInput {
  slug: string;
  name: string;
  status?: OrganizationStatus | undefined;
}

export interface FindOrganizationByIdInput {
  id: string;
}

export interface FindOrganizationBySlugInput {
  slug: string;
}

export interface UpdateOrganizationStatusInput {
  id: string;
  status: OrganizationStatus;
}

export class OrganizationRepository {
  constructor(private readonly db: DatabaseInstance) {}

  async createOrganization(input: CreateOrganizationInput) {
    const [created] = await this.db
      .insert(organizations)
      .values({
        slug: input.slug,
        name: input.name,
        status: input.status ?? 'ACTIVE',
      })
      .returning();

    return created;
  }

  async findOrganizationById(input: FindOrganizationByIdInput) {
    const [found] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, input.id))
      .limit(1);

    return found ?? null;
  }

  async findOrganizationBySlug(input: FindOrganizationBySlugInput) {
    const [found] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, input.slug))
      .limit(1);

    return found ?? null;
  }

  async updateOrganizationStatus(input: UpdateOrganizationStatusInput) {
    const [updated] = await this.db
      .update(organizations)
      .set({ status: input.status })
      .where(eq(organizations.id, input.id))
      .returning();

    return updated ?? null;
  }
}
