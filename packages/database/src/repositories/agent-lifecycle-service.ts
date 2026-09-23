import { and, eq, sql } from 'drizzle-orm';
import { ConflictError, EntitlementExceededError, NotFoundError } from '@voice-agent/errors';
import type { DatabaseInstance } from '../client/connection.js';
import { agents } from '../schema/agents.js';
import { organizations } from '../schema/organizations.js';
import { auditLogs } from '../schema/audit.js';
import type { CommercialEntitlementResolver } from './commercial-entitlement-resolver.js';
import type { DatabaseExecutor } from './database-executor.js';

export interface CreateAgentInput {
  organizationId: string;
  name: string;
  slug: string;
  createdBy: string;
  at?: Date;
}

export interface ReactivateAgentInput {
  organizationId: string;
  agentId: string;
  actorId: string;
  at?: Date;
}

export class AgentLifecycleService {
  constructor(
    private readonly db: DatabaseInstance,
    private readonly entitlementResolver: CommercialEntitlementResolver,
  ) {}

  private async assertQuotaAvailable(
    tx: DatabaseExecutor,
    organizationId: string,
    at: Date,
  ): Promise<void> {
    const [org] = await tx
      .select({ status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .for('update');

    if (!org || org.status !== 'ACTIVE') {
      throw new EntitlementExceededError(`Organization '${organizationId}' is not active`);
    }

    const entitlement = await this.entitlementResolver.resolveNumericEntitlement(
      organizationId,
      'agents.max',
      { at, executor: tx },
    );

    if (!entitlement.granted || entitlement.limit === null) {
      throw new EntitlementExceededError(
        `agents.max entitlement is not granted for '${organizationId}'`,
      );
    }

    const [countRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(agents)
      .where(and(eq(agents.organizationId, organizationId), eq(agents.status, 'ACTIVE')));

    const count = countRow?.count ?? 0;
    if (count >= entitlement.limit) {
      throw new EntitlementExceededError(
        `Quota exceeded for agents.max: active agents (${count}) reached limit (${entitlement.limit})`,
      );
    }
  }

  async createAgent(input: CreateAgentInput) {
    const at = input.at ?? new Date();

    return this.db.transaction(async (tx) => {
      await this.assertQuotaAvailable(tx, input.organizationId, at);

      const [existingSlug] = await tx
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.organizationId, input.organizationId), eq(agents.slug, input.slug)))
        .limit(1);

      if (existingSlug) {
        throw new ConflictError(
          `Agent with slug '${input.slug}' already exists in organization '${input.organizationId}'`,
        );
      }

      const [created] = await tx
        .insert(agents)
        .values({
          organizationId: input.organizationId,
          name: input.name,
          slug: input.slug,
          status: 'ACTIVE',
          createdAt: at,
          updatedAt: at,
        })
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: input.organizationId,
        actorId: input.createdBy,
        actorType: 'USER',
        action: 'agent.created',
        targetType: 'agent',
        targetId: created!.id,
        metadata: JSON.stringify({
          agentId: created!.id,
          slug: created!.slug,
          name: created!.name,
        }),
        createdAt: at,
      });

      return created!;
    });
  }

  async reactivateAgent(input: ReactivateAgentInput) {
    const at = input.at ?? new Date();

    return this.db.transaction(async (tx) => {
      await this.assertQuotaAvailable(tx, input.organizationId, at);

      const [agent] = await tx
        .select()
        .from(agents)
        .where(and(eq(agents.id, input.agentId), eq(agents.organizationId, input.organizationId)))
        .for('update');

      if (!agent) {
        throw new NotFoundError(`Agent '${input.agentId}' not found in organization`);
      }
      if (agent.status === 'ACTIVE') {
        return agent;
      }

      const [updated] = await tx
        .update(agents)
        .set({ status: 'ACTIVE', updatedAt: at })
        .where(eq(agents.id, input.agentId))
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorType: 'USER',
        action: 'agent.reactivated',
        targetType: 'agent',
        targetId: input.agentId,
        metadata: JSON.stringify({ agentId: input.agentId }),
        createdAt: at,
      });

      return updated!;
    });
  }
}
