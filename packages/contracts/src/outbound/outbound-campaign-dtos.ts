import { z } from 'zod';
import { outboundCampaignStatusSchema, type OutboundCampaignStatus } from './outbound-contracts.js';
import type { OutboundCallJobStatus } from './outbound-job-status.js';

export const createOutboundCampaignHttpBodySchema = z
  .object({
    agentId: z.string().uuid(),
    agentVersionId: z.string().uuid(),
    name: z.string().trim().min(1),
    description: z.string().trim().optional(),
    status: outboundCampaignStatusSchema.default('ACTIVE'),
  })
  .strict();

export type CreateOutboundCampaignHttpBody = z.infer<typeof createOutboundCampaignHttpBodySchema>;

export const listOutboundCampaignsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type ListOutboundCampaignsQuery = z.infer<typeof listOutboundCampaignsQuerySchema>;

export const listOutboundCampaignsInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type ListOutboundCampaignsInput = z.infer<typeof listOutboundCampaignsInputSchema>;

export interface OutboundCampaignResponse {
  readonly id: string;
  readonly organizationId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly name: string;
  readonly description?: string | null | undefined;
  readonly status: OutboundCampaignStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OutboundCallJobResponse {
  readonly id: string;
  readonly organizationId: string;
  readonly campaignId?: string | null | undefined;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly destinationPhone: string;
  readonly recipientName?: string | null | undefined;
  readonly status: OutboundCallJobStatus;
  readonly scheduledAt: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly idempotencyKey: string;
  readonly callId?: string | null | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ScheduleBatchJobsResponse {
  readonly campaignId: string;
  readonly count: number;
  readonly jobs: readonly OutboundCallJobResponse[];
}
