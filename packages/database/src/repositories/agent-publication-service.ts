import { and, eq } from 'drizzle-orm';
import {
  agentConfigurationSnapshotV1Schema,
  type CommercialPublicationPolicy,
} from '@voice-agent/contracts';
import { InvalidStateTransitionError, NotFoundError } from '@voice-agent/errors';
import type { DatabaseInstance } from '../client/connection.js';
import { agents, agentVersions } from '../schema/agents.js';
import { auditLogs } from '../schema/audit.js';
import type { DatabaseExecutor } from './database-executor.js';

export interface PublishDraftInput {
  organizationId: string;
  agentId: string;
  draftVersionId: string;
  publishedBy: string;
  at?: Date;
}

export class AgentPublicationService {
  constructor(
    private readonly db: DatabaseInstance,
    private readonly publicationPolicy: CommercialPublicationPolicy,
  ) {}

  private async assertCanPublish(tx: DatabaseExecutor, input: PublishDraftInput, at: Date) {
    const [agent] = await tx
      .select()
      .from(agents)
      .where(and(eq(agents.id, input.agentId), eq(agents.organizationId, input.organizationId)))
      .for('update');

    if (!agent) {
      throw new NotFoundError(`Agent '${input.agentId}' not found in organization`);
    }
    if (agent.status !== 'ACTIVE') {
      throw new InvalidStateTransitionError(
        `Cannot publish version for agent '${input.agentId}': agent is not active (status: ${agent.status})`,
      );
    }

    await this.publicationPolicy.assertEligibleForPublish(input.organizationId, {
      at,
      executor: tx,
    });

    const [draft] = await tx
      .select()
      .from(agentVersions)
      .where(
        and(
          eq(agentVersions.id, input.draftVersionId),
          eq(agentVersions.agentId, input.agentId),
          eq(agentVersions.organizationId, input.organizationId),
        ),
      )
      .for('update');

    if (!draft) {
      throw new NotFoundError(`Draft version '${input.draftVersionId}' not found`);
    }
    if (draft.status !== 'DRAFT') {
      throw new InvalidStateTransitionError(
        `Cannot publish version '${input.draftVersionId}': status is ${draft.status} (only DRAFT can be published)`,
      );
    }

    agentConfigurationSnapshotV1Schema.parse(draft.configuration);
    return draft;
  }

  async publishDraft(input: PublishDraftInput) {
    const at = input.at ?? new Date();

    return this.db.transaction(async (tx) => {
      const draft = await this.assertCanPublish(tx, input, at);

      const [existingPublished] = await tx
        .select({ id: agentVersions.id })
        .from(agentVersions)
        .where(
          and(
            eq(agentVersions.agentId, input.agentId),
            eq(agentVersions.organizationId, input.organizationId),
            eq(agentVersions.status, 'PUBLISHED'),
          ),
        )
        .for('update');

      if (existingPublished) {
        await tx
          .update(agentVersions)
          .set({ status: 'ARCHIVED', updatedAt: at })
          .where(eq(agentVersions.id, existingPublished.id));
      }

      const [published] = await tx
        .update(agentVersions)
        .set({
          status: 'PUBLISHED',
          publishedAt: at,
          publishedBy: input.publishedBy,
          updatedAt: at,
        })
        .where(eq(agentVersions.id, input.draftVersionId))
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: input.organizationId,
        actorId: input.publishedBy,
        actorType: 'USER',
        action: 'agent.version_published',
        targetType: 'agent',
        targetId: input.agentId,
        metadata: JSON.stringify({
          agentId: input.agentId,
          versionId: published!.id,
          versionNumber: draft.versionNumber,
          previousPublishedVersionId: existingPublished?.id ?? null,
        }),
        createdAt: at,
      });

      return published!;
    });
  }
}
