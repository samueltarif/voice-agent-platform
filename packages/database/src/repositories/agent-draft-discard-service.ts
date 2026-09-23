import { and, eq } from 'drizzle-orm';
import { InvalidStateTransitionError, NotFoundError } from '@voice-agent/errors';
import type { DatabaseInstance } from '../client/connection.js';
import { agentVersions } from '../schema/agents.js';
import { auditLogs } from '../schema/audit.js';

export interface DiscardDraftInput {
  organizationId: string;
  agentId: string;
  versionId: string;
  actorId: string;
  at?: Date;
}

export class AgentDraftDiscardService {
  constructor(private readonly db: DatabaseInstance) {}

  async discardDraft(input: DiscardDraftInput) {
    const at = input.at ?? new Date();

    return this.db.transaction(async (tx) => {
      const [version] = await tx
        .select()
        .from(agentVersions)
        .where(
          and(
            eq(agentVersions.id, input.versionId),
            eq(agentVersions.agentId, input.agentId),
            eq(agentVersions.organizationId, input.organizationId),
          ),
        )
        .for('update');

      if (!version) {
        throw new NotFoundError(`AgentVersion '${input.versionId}' not found`);
      }
      if (version.status !== 'DRAFT') {
        throw new InvalidStateTransitionError(
          `Cannot discard version '${input.versionId}': status is ${version.status} (only unpromoted DRAFT can be discarded)`,
        );
      }
      if (version.publishedAt !== null) {
        throw new InvalidStateTransitionError(
          `Cannot discard version '${input.versionId}': version has historical published timestamp`,
        );
      }

      await tx.delete(agentVersions).where(eq(agentVersions.id, input.versionId));

      await tx.insert(auditLogs).values({
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorType: 'USER',
        action: 'agent.draft_discarded',
        targetType: 'agent',
        targetId: input.agentId,
        metadata: JSON.stringify({
          agentId: input.agentId,
          versionId: input.versionId,
          versionNumber: version.versionNumber,
        }),
        createdAt: at,
      });

      return { success: true, discardedVersionNumber: version.versionNumber };
    });
  }
}
