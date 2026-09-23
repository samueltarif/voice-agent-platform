import { desc, eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import { auditLogs } from '../schema/audit.js';

export interface CreateAuditLogInput {
  organizationId?: string | undefined;
  actorId: string;
  actorType?: string | undefined;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: string | undefined;
}

export interface ListAuditLogsByOrganizationInput {
  organizationId: string;
  limit?: number | undefined;
}

export class AuditRepository {
  constructor(private readonly db: DatabaseInstance) {}

  async createAuditLog(input: CreateAuditLogInput) {
    const [created] = await this.db
      .insert(auditLogs)
      .values({
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorType: input.actorType ?? 'USER',
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata,
      })
      .returning();

    return created;
  }

  async listAuditLogsByOrganization(input: ListAuditLogsByOrganizationInput) {
    return this.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, input.organizationId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(input.limit ?? 50);
  }
}
