import { and, eq } from 'drizzle-orm';
import type { AgentStatus } from '@voice-agent/contracts';
import { NotFoundError } from '@voice-agent/errors';
import type { DatabaseInstance } from '../client/connection.js';
import { agents } from '../schema/agents.js';
import { auditLogs } from '../schema/audit.js';

export interface ArchiveAgentInput {
  organizationId: string;
  agentId: string;
  actorId: string;
}

export class AgentRepository {
  constructor(private readonly db: DatabaseInstance) {}

  async getAgentById(input: { organizationId: string; agentId: string }) {
    const [agent] = await this.db
      .select()
      .from(agents)
      .where(and(eq(agents.id, input.agentId), eq(agents.organizationId, input.organizationId)))
      .limit(1);
    return agent ?? null;
  }

  async listAgentsByOrganization(input: { organizationId: string; status?: AgentStatus }) {
    const conditions = [eq(agents.organizationId, input.organizationId)];
    if (input.status) {
      conditions.push(eq(agents.status, input.status));
    }
    return this.db
      .select()
      .from(agents)
      .where(and(...conditions));
  }

  async archiveAgent(input: ArchiveAgentInput) {
    const at = new Date();

    return this.db.transaction(async (tx) => {
      const [agent] = await tx
        .select()
        .from(agents)
        .where(and(eq(agents.id, input.agentId), eq(agents.organizationId, input.organizationId)))
        .for('update');

      if (!agent) {
        throw new NotFoundError(`Agent '${input.agentId}' not found in organization`);
      }
      if (agent.status === 'ARCHIVED') {
        return agent;
      }

      const [updated] = await tx
        .update(agents)
        .set({ status: 'ARCHIVED', updatedAt: at })
        .where(eq(agents.id, input.agentId))
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorType: 'USER',
        action: 'agent.archived',
        targetType: 'agent',
        targetId: input.agentId,
        metadata: JSON.stringify({ agentId: input.agentId }),
        createdAt: at,
      });

      return updated!;
    });
  }
}
