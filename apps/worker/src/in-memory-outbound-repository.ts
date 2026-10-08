import {
  validateJobStatusTransition,
  type ClaimJobInput,
  type ClaimNextDueJobInput,
  type CreateOutboundCampaignInput,
  type CreateOutboundJobInput,
  type ListOutboundCampaignsInput,
  type OutboundCallJob,
  type OutboundCampaign,
  type OutboundRepositoryPort,
  type ScheduleBatchJobsInput,
  type UpdateJobOutcomeInput,
} from '@voice-agent/contracts';
import { scheduleInMemoryBatchJobs } from './in-memory-outbound-batch-scheduler.js';

function isJobDue(job: OutboundCallJob, now: Date): boolean {
  if (job.status === 'SCHEDULED') return job.scheduledAt <= now;
  return Boolean(job.status === 'FAILED_RETRYABLE' && job.nextRetryAt && job.nextRetryAt <= now);
}

function isEligibleToClaim(job: OutboundCallJob, orgId: string, now: Date): boolean {
  return job.organizationId === orgId && job.attempts < job.maxAttempts && isJobDue(job, now);
}

export class InMemoryOutboundRepository implements OutboundRepositoryPort {
  private readonly campaigns = new Map<string, OutboundCampaign>();
  private readonly jobs = new Map<string, OutboundCallJob>();

  async createCampaign(input: CreateOutboundCampaignInput): Promise<OutboundCampaign> {
    const now = new Date();
    const campaign: OutboundCampaign = {
      id: `camp-${Math.random().toString(36).substring(2, 9)}`,
      organizationId: input.organizationId,
      agentId: input.agentId,
      agentVersionId: input.agentVersionId,
      name: input.name,
      description: input.description,
      status: input.status ?? 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  async getCampaignById(orgId: string, campId: string): Promise<OutboundCampaign | null> {
    const camp = this.campaigns.get(campId);
    return camp && camp.organizationId === orgId ? camp : null;
  }

  async listCampaigns(input: ListOutboundCampaignsInput): Promise<OutboundCampaign[]> {
    const limit = Math.min(Math.max(1, input.limit ?? 20), 100);
    const offset = Math.max(0, input.offset ?? 0);
    return Array.from(this.campaigns.values())
      .filter((c) => c.organizationId === input.organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);
  }

  async scheduleBatchJobs(input: ScheduleBatchJobsInput): Promise<OutboundCallJob[]> {
    return scheduleInMemoryBatchJobs(this, input);
  }

  async createJob(input: CreateOutboundJobInput): Promise<OutboundCallJob> {
    const now = new Date();
    const job: OutboundCallJob = {
      id: `job-${Math.random().toString(36).substring(2, 9)}`,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      agentId: input.agentId,
      agentVersionId: input.agentVersionId,
      destinationPhone: input.destinationPhone,
      recipientName: input.recipientName,
      status: 'SCHEDULED',
      scheduledAt: input.scheduledAt ?? now,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async getJobById(orgId: string, jobId: string): Promise<OutboundCallJob | null> {
    const job = this.jobs.get(jobId);
    return job && job.organizationId === orgId ? job : null;
  }

  async getJobByIdempotencyKey(orgId: string, key: string): Promise<OutboundCallJob | null> {
    for (const j of this.jobs.values()) {
      if (j.organizationId === orgId && j.idempotencyKey === key) return j;
    }
    return null;
  }

  async claimNextDueJob(input: ClaimNextDueJobInput): Promise<OutboundCallJob | null> {
    const now = input.now ?? new Date();
    const eligible = Array.from(this.jobs.values())
      .filter((j) => isEligibleToClaim(j, input.organizationId, now))
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    return eligible[0] ? this.applyClaim(eligible[0], input.workerId, now) : null;
  }

  async claimJob(input: ClaimJobInput): Promise<OutboundCallJob | null> {
    const job = this.jobs.get(input.jobId);
    const now = input.now ?? new Date();
    return job && isEligibleToClaim(job, input.organizationId, now)
      ? this.applyClaim(job, input.workerId, now)
      : null;
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
