import { and, eq, ne } from 'drizzle-orm';
import {
  ConflictError,
  InvalidStateTransitionError,
  NotFoundError,
} from '@voice-agent/errors';
import type { DatabaseInstance } from '../client/connection.js';
import { agentVersions } from '../schema/agents.js';
import { knowledgeDocuments } from '../schema/knowledge.js';
import { auditLogs } from '../schema/audit.js';

export interface DiscardDraftInput {
  organizationId: string;
  agentId: string;
  versionId: string;
  actorId: string;
  at?: Date;
}

async function assertNoActiveKnowledge(
  tx: Parameters<Parameters<DatabaseInstance['transaction']>[0]>[0],
  input: DiscardDraftInput,
): Promise<void> {
  const [blocking] = await tx
    .select({ id: knowledgeDocuments.id })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.organizationId, input.organizationId),
        eq(knowledgeDocuments.agentVersionId, input.versionId),
        ne(knowledgeDocuments.status, 'ARCHIVED'),
      ),
    )
    .limit(1)
    .for('update');
  if (blocking) {
    throw new ConflictError(
      `Cannot discard draft version '${input.versionId}': non-archived knowledge documents remain attached`,
    );
  }
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

      await assertNoActiveKnowledge(tx, input);

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
