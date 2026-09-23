import { and, eq } from 'drizzle-orm';
import {
  agentConfigurationSnapshotV1Schema,
  type AgentConfigurationSnapshotV1,
} from '@voice-agent/contracts';
import { ConflictError, InvalidStateTransitionError, NotFoundError } from '@voice-agent/errors';
import type { DatabaseInstance } from '../client/connection.js';
import { agents, agentVersions } from '../schema/agents.js';
import { auditLogs } from '../schema/audit.js';
import { resolveNextAgentVersionNumber } from './agent-version-allocator.js';
import type { DatabaseExecutor } from './database-executor.js';

export interface CreateDraftInput {
  organizationId: string;
  agentId: string;
  configuration: AgentConfigurationSnapshotV1 | unknown;
  changelog?: string;
  createdBy: string;
  at?: Date;
}

export interface UpdateDraftConfigurationInput {
  organizationId: string;
  agentId: string;
  versionId: string;
  configuration: AgentConfigurationSnapshotV1 | unknown;
  changelog?: string;
  at?: Date;
}

export class AgentDraftService {
  constructor(private readonly db: DatabaseInstance) {}

  private async assertAgentActiveAndNoDraft(
    tx: DatabaseExecutor,
    organizationId: string,
    agentId: string,
  ): Promise<void> {
    const [agent] = await tx
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.organizationId, organizationId)))
      .for('update');

    if (!agent) {
      throw new NotFoundError(`Agent '${agentId}' not found in organization`);
    }
    if (agent.status !== 'ACTIVE') {
      throw new InvalidStateTransitionError(
        `Cannot create draft for agent '${agentId}': agent is not active (status: ${agent.status})`,
      );
    }

    const [existingDraft] = await tx
      .select({ id: agentVersions.id })
      .from(agentVersions)
      .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.status, 'DRAFT')))
      .for('update');

    if (existingDraft) {
      throw new ConflictError(
        `Cannot create draft: an active draft already exists for agent '${agentId}'`,
      );
    }
  }

  async createDraft(input: CreateDraftInput) {
    const validatedConfig = agentConfigurationSnapshotV1Schema.parse(input.configuration);
    const at = input.at ?? new Date();

    return this.db.transaction(async (tx) => {
      await this.assertAgentActiveAndNoDraft(tx, input.organizationId, input.agentId);

      const nextVersionNumber = await resolveNextAgentVersionNumber(
        tx,
        input.organizationId,
        input.agentId,
      );

      const [draft] = await tx
        .insert(agentVersions)
        .values({
          organizationId: input.organizationId,
          agentId: input.agentId,
          versionNumber: nextVersionNumber,
          status: 'DRAFT',
          configurationSchemaVersion: 1,
          configuration: validatedConfig,
          changelog: input.changelog,
          createdBy: input.createdBy,
          createdAt: at,
          updatedAt: at,
        })
        .returning();

      await tx.insert(auditLogs).values({
        organizationId: input.organizationId,
        actorId: input.createdBy,
        actorType: 'USER',
        action: 'agent.draft_created',
        targetType: 'agent',
        targetId: input.agentId,
        metadata: JSON.stringify({
          agentId: input.agentId,
          versionId: draft!.id,
          versionNumber: nextVersionNumber,
        }),
        createdAt: at,
      });

      return draft!;
    });
  }

  async updateDraftConfiguration(input: UpdateDraftConfigurationInput) {
    const validatedConfig = agentConfigurationSnapshotV1Schema.parse(input.configuration);
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
          `Cannot modify version '${input.versionId}': status is ${version.status} (only DRAFT can be updated)`,
        );
      }

      const [updated] = await tx
        .update(agentVersions)
        .set({
          configuration: validatedConfig,
          changelog: input.changelog ?? version.changelog,
          updatedAt: at,
        })
        .where(eq(agentVersions.id, input.versionId))
        .returning();

      return updated!;
    });
  }
}
