import {
  validateJobStatusTransition,
  type ClaimJobInput,
  type ClaimNextDueJobInput,
  type CreateOutboundCampaignInput,
  type CreateOutboundJobInput,
  type OutboundCallJob,
  type OutboundCampaign,
  type OutboundRepositoryPort,
  type UpdateJobOutcomeInput,
} from '@voice-agent/contracts';

function isJobDue(job: OutboundCallJob, now: Date): boolean {
  if (job.status === 'SCHEDULED') return job.scheduledAt <= now;
  if (job.status === 'FAILED_RETRYABLE') return Boolean(job.nextRetryAt && job.nextRetryAt <= now);
  return false;
}

function isEligibleToClaim(job: OutboundCallJob, orgId: string, now: Date): boolean {
  if (job.organizationId !== orgId) return false;
  if (job.attempts >= job.maxAttempts) return false;
  return isJobDue(job, now);
}

export class InMemoryOutboundRepository implements OutboundRepositoryPort {
  private readonly campaigns = new Map<string, OutboundCampaign>();
  private readonly jobs = new Map<string, OutboundCallJob>();

  async createCampaign(input: CreateOutboundCampaignInput): Promise<OutboundCampaign> {
    const campaign: OutboundCampaign = {
      id: `camp-${Math.random().toString(36).substring(2, 9)}`,
      organizationId: input.organizationId,
      agentId: input.agentId,
      agentVersionId: input.agentVersionId,
      name: input.name,
      description: input.description,
      status: input.status ?? 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  async getCampaignById(
    organizationId: string,
    campaignId: string,
  ): Promise<OutboundCampaign | null> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.organizationId !== organizationId) return null;
    return campaign;
  }

  async createJob(input: CreateOutboundJobInput): Promise<OutboundCallJob> {
    const job: OutboundCallJob = {
      id: `job-${Math.random().toString(36).substring(2, 9)}`,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      agentId: input.agentId,
      agentVersionId: input.agentVersionId,
      destinationPhone: input.destinationPhone,
      recipientName: input.recipientName,
      status: 'SCHEDULED',
      scheduledAt: input.scheduledAt ?? new Date(),
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async getJobById(organizationId: string, jobId: string): Promise<OutboundCallJob | null> {
    const job = this.jobs.get(jobId);
    if (!job || job.organizationId !== organizationId) return null;
    return job;
  }

  async getJobByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<OutboundCallJob | null> {
    for (const job of this.jobs.values()) {
      if (job.organizationId === organizationId && job.idempotencyKey === idempotencyKey) {
        return job;
      }
    }
    return null;
  }

  async claimNextDueJob(input: ClaimNextDueJobInput): Promise<OutboundCallJob | null> {
    const now = input.now ?? new Date();
    const eligible = Array.from(this.jobs.values())
      .filter((j) => isEligibleToClaim(j, input.organizationId, now))
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

    const first = eligible[0];
    if (!first) return null;
    return this.applyClaim(first, input.workerId, now);
  }

  async claimJob(input: ClaimJobInput): Promise<OutboundCallJob | null> {
    const job = this.jobs.get(input.jobId);
    const now = input.now ?? new Date();
    if (!job || !isEligibleToClaim(job, input.organizationId, now)) {
      return null;
    }
    return this.applyClaim(job, input.workerId, now);
  }

  async updateJobOutcome(input: UpdateJobOutcomeInput): Promise<OutboundCallJob> {
    const job = this.jobs.get(input.jobId);
    if (!job || job.organizationId !== input.organizationId) {
      throw new Error(`Job '${input.jobId}' not found for tenant '${input.organizationId}'`);
    }
    const now = input.now ?? new Date();
    validateJobStatusTransition(job.status, input.status);
    const updated: OutboundCallJob = {
      ...job,
      status: input.status,
      callId: input.callId ?? job.callId,
      lastError: input.lastError ?? job.lastError,
      lastAttemptAt: input.lastAttemptAt ?? now,
      nextRetryAt: input.nextRetryAt,
      updatedAt: now,
    };
    this.jobs.set(input.jobId, updated);
    return updated;
  }

  private applyClaim(job: OutboundCallJob, workerId: string, now: Date): OutboundCallJob {
    const updated: OutboundCallJob = {
      ...job,
      status: 'CLAIMED',
      claimedAt: now,
      claimedBy: workerId,
      attempts: job.attempts + 1,
      updatedAt: now,
    };
    this.jobs.set(job.id, updated);
    return updated;
  }
}
