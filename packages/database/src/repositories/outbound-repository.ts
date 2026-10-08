import { and, eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import type {
  ClaimJobInput,
  ClaimNextDueJobInput,
  CreateOutboundCampaignInput,
  CreateOutboundJobInput,
  OutboundCallJob,
  OutboundCampaign,
  OutboundRepositoryPort,
  UpdateJobOutcomeInput,
} from '@voice-agent/contracts';
import { validateJobStatusTransition } from '@voice-agent/contracts';
import { outboundCallJobs, type OutboundCallJobEntity } from '../schema/outbound.js';
import { agentVersions } from '../schema/agents.js';
import { mapOutboundCallJob } from './outbound-mapping.js';
import { createOutboundCampaign, getOutboundCampaignById } from './outbound-campaign-repository.js';
import { buildClaimNextDueJobSql, buildClaimJobSql } from './outbound-claim-queries.js';

export class DrizzleOutboundRepository implements OutboundRepositoryPort {
  constructor(private readonly db: DatabaseInstance) {}

  async createCampaign(input: CreateOutboundCampaignInput): Promise<OutboundCampaign> {
    return createOutboundCampaign(this.db, input);
  }

  async getCampaignById(
    organizationId: string,
    campaignId: string,
  ): Promise<OutboundCampaign | null> {
    return getOutboundCampaignById(this.db, organizationId, campaignId);
  }

  async createJob(input: CreateOutboundJobInput): Promise<OutboundCallJob> {
    const [version] = await this.db
      .select({ id: agentVersions.id, status: agentVersions.status })
      .from(agentVersions)
      .where(
        and(
          eq(agentVersions.id, input.agentVersionId),
          eq(agentVersions.agentId, input.agentId),
          eq(agentVersions.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    if (!version || version.status !== 'PUBLISHED') {
      throw new Error(
        `Agent version '${input.agentVersionId}' must be PUBLISHED to create outbound jobs`,
      );
    }

    const [row] = await this.db
      .insert(outboundCallJobs)
      .values({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        agentId: input.agentId,
        agentVersionId: input.agentVersionId,
        destinationPhone: input.destinationPhone,
        recipientName: input.recipientName,
        status: 'SCHEDULED',
        scheduledAt: input.scheduledAt ?? new Date(),
        maxAttempts: input.maxAttempts ?? 3,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();

    return mapOutboundCallJob(row!);
  }

  async getJobById(organizationId: string, jobId: string): Promise<OutboundCallJob | null> {
    const [row] = await this.db
      .select()
      .from(outboundCallJobs)
      .where(
        and(eq(outboundCallJobs.organizationId, organizationId), eq(outboundCallJobs.id, jobId)),
      )
      .limit(1);

    return row ? mapOutboundCallJob(row) : null;
  }

  async getJobByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<OutboundCallJob | null> {
    const [row] = await this.db
      .select()
      .from(outboundCallJobs)
      .where(
        and(
          eq(outboundCallJobs.organizationId, organizationId),
          eq(outboundCallJobs.id, idempotencyKey),
        ),
      )
      .limit(1);

    return row ? mapOutboundCallJob(row) : null;
  }

  async claimNextDueJob(input: ClaimNextDueJobInput): Promise<OutboundCallJob | null> {
    const now = input.now ?? new Date();
    const query = buildClaimNextDueJobSql(input.organizationId, input.workerId, now);
    const result = await this.db.execute<OutboundCallJobEntity>(query);
    const row = result.rows[0];
    return row ? mapOutboundCallJob(row) : null;
  }

  async claimJob(input: ClaimJobInput): Promise<OutboundCallJob | null> {
    const now = input.now ?? new Date();
    const query = buildClaimJobSql(input, now);
    const result = await this.db.execute<OutboundCallJobEntity>(query);
    const row = result.rows[0];
    return row ? mapOutboundCallJob(row) : null;
  }

  async updateJobOutcome(input: UpdateJobOutcomeInput): Promise<OutboundCallJob> {
    const now = input.now ?? new Date();
    const current = await this.getJobById(input.organizationId, input.jobId);
    if (!current) {
      throw new Error(`Job '${input.jobId}' not found for tenant '${input.organizationId}'`);
    }

    validateJobStatusTransition(current.status, input.status);

    const [updated] = await this.db
      .update(outboundCallJobs)
      .set({
        status: input.status,
        callId: input.callId ?? current.callId,
        lastError: input.lastError ?? current.lastError,
        nextRetryAt: input.nextRetryAt ?? null,
        lastAttemptAt: input.lastAttemptAt ?? now,
        updatedAt: now,
      })
      .where(
        and(
          eq(outboundCallJobs.organizationId, input.organizationId),
          eq(outboundCallJobs.id, input.jobId),
        ),
      )
      .returning();

    return mapOutboundCallJob(updated!);
  }
}
