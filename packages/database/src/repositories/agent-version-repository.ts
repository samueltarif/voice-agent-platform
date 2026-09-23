import { and, desc, eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import { agentVersions } from '../schema/agents.js';

export class AgentVersionRepository {
  constructor(private readonly db: DatabaseInstance) {}

  async getCurrentPublishedVersion(input: { organizationId: string; agentId: string }) {
    const [version] = await this.db
      .select()
      .from(agentVersions)
      .where(
        and(
          eq(agentVersions.organizationId, input.organizationId),
          eq(agentVersions.agentId, input.agentId),
          eq(agentVersions.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    return version ?? null;
  }

  async listVersionsByAgent(input: { organizationId: string; agentId: string }) {
    return this.db
      .select()
      .from(agentVersions)
      .where(
        and(
          eq(agentVersions.organizationId, input.organizationId),
          eq(agentVersions.agentId, input.agentId),
        ),
      )
      .orderBy(desc(agentVersions.versionNumber));
  }
}
