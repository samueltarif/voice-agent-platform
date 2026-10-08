import { z } from 'zod';
import type { OutboundCallJobStatus } from './outbound-job-status.js';
import type { ScheduleBatchJobsInput } from './outbound-batch-contracts.js';
import type { ListOutboundCampaignsInput } from './outbound-campaign-dtos.js';

export const OUTBOUND_CAMPAIGN_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELED',
] as const;

export const outboundCampaignStatusSchema = z.enum(OUTBOUND_CAMPAIGN_STATUSES);
export type OutboundCampaignStatus = z.infer<typeof outboundCampaignStatusSchema>;

export interface OutboundCampaign {
  readonly id: string;
  readonly organizationId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly status: OutboundCampaignStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OutboundCallJob {
  readonly id: string;
  readonly organizationId: string;
  readonly campaignId?: string | undefined;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly destinationPhone: string;
  readonly recipientName?: string | undefined;
  readonly status: OutboundCallJobStatus;
  readonly scheduledAt: Date;
  readonly claimedAt?: Date | undefined;
  readonly claimedBy?: string | undefined;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastAttemptAt?: Date | undefined;
  readonly nextRetryAt?: Date | undefined;
  readonly lastError?: string | undefined;
  readonly idempotencyKey: string;
  readonly callId?: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const createOutboundCampaignInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    agentId: z.string().uuid(),
    agentVersionId: z.string().uuid(),
    name: z.string().trim().min(1),
    description: z.string().trim().optional(),
    status: outboundCampaignStatusSchema.default('DRAFT'),
  })
  .strict();

export type CreateOutboundCampaignInput = z.input<typeof createOutboundCampaignInputSchema>;

export const createOutboundJobInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    campaignId: z.string().uuid().optional(),
    agentId: z.string().uuid(),
    agentVersionId: z.string().uuid(),
    destinationPhone: z.string().trim().min(1),
    recipientName: z.string().trim().optional(),
    scheduledAt: z.date().default(() => new Date()),
    maxAttempts: z.number().int().positive().default(3),
    idempotencyKey: z.string().trim().min(1),
  })
  .strict();

export type CreateOutboundJobInput = z.input<typeof createOutboundJobInputSchema>;

export interface ClaimNextDueJobInput {
  readonly organizationId: string;
  readonly workerId: string;
  readonly now?: Date | undefined;
}

export interface ClaimJobInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly workerId: string;
  readonly now?: Date | undefined;
}

export interface UpdateJobOutcomeInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly status: OutboundCallJobStatus;
  readonly callId?: string | undefined;
  readonly lastError?: string | undefined;
  readonly nextRetryAt?: Date | undefined;
  readonly lastAttemptAt?: Date | undefined;
  readonly now?: Date | undefined;
}

export interface OutboundRepositoryPort {
  createCampaign(input: CreateOutboundCampaignInput): Promise<OutboundCampaign>;
  getCampaignById(organizationId: string, campaignId: string): Promise<OutboundCampaign | null>;
  listCampaigns(input: ListOutboundCampaignsInput): Promise<OutboundCampaign[]>;
  createJob(input: CreateOutboundJobInput): Promise<OutboundCallJob>;
  getJobById(organizationId: string, jobId: string): Promise<OutboundCallJob | null>;
  getJobByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<OutboundCallJob | null>;
  scheduleBatchJobs(input: ScheduleBatchJobsInput): Promise<OutboundCallJob[]>;
  claimNextDueJob(input: ClaimNextDueJobInput): Promise<OutboundCallJob | null>;
  claimJob(input: ClaimJobInput): Promise<OutboundCallJob | null>;
  updateJobOutcome(input: UpdateJobOutcomeInput): Promise<OutboundCallJob>;
}
