import type { OutboundCallJob, OutboundCampaign } from '@voice-agent/contracts';
import type { OutboundCallJobEntity, OutboundCampaignEntity } from '../schema/outbound.js';

function parseDate(val: Date | string | null | undefined): Date | undefined {
  if (!val) return undefined;
  return new Date(val);
}

function parseText(val: string | null | undefined): string | undefined {
  return val || undefined;
}

export function mapOutboundCampaign(row: OutboundCampaignEntity): OutboundCampaign {
  return {
    id: row.id,
    organizationId: row.organizationId,
    agentId: row.agentId,
    agentVersionId: row.agentVersionId,
    name: row.name,
    description: parseText(row.description),
    status: row.status,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export function mapOutboundCallJob(row: OutboundCallJobEntity): OutboundCallJob {
  return {
    id: row.id,
    organizationId: row.organizationId,
    campaignId: parseText(row.campaignId),
    agentId: row.agentId,
    agentVersionId: row.agentVersionId,
    destinationPhone: row.destinationPhone,
    recipientName: parseText(row.recipientName),
    status: row.status,
    scheduledAt: new Date(row.scheduledAt),
    claimedAt: parseDate(row.claimedAt),
    claimedBy: parseText(row.claimedBy),
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    lastAttemptAt: parseDate(row.lastAttemptAt),
    nextRetryAt: parseDate(row.nextRetryAt),
    lastError: parseText(row.lastError),
    idempotencyKey: row.idempotencyKey,
    callId: parseText(row.callId),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}
