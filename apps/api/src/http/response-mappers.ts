import type {
  AgentMetadataResponse,
  AgentVersionMetadataResponse,
  AgentVersionConfigurationResponse,
  AgentConfigurationSnapshotV1,
  OutboundCampaign,
  OutboundCallJob,
  OutboundCampaignResponse,
  OutboundCallJobResponse,
} from '@voice-agent/contracts';
import type { Agent, AgentVersion } from '@voice-agent/database';

export function toAgentMetadataDto(
  agent: Agent,
  currentPublishedVersionNumber: number | null = null,
): AgentMetadataResponse {
  return {
    id: agent.id,
    name: agent.name,
    slug: agent.slug,
    status: agent.status,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
    currentPublishedVersionNumber,
  };
}

export function toAgentVersionMetadataDto(version: AgentVersion): AgentVersionMetadataResponse {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    configurationSchemaVersion: version.configurationSchemaVersion,
    publishedAt: version.publishedAt ? version.publishedAt.toISOString() : null,
    publishedBy: version.publishedBy,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
  };
}

export function toAgentConfigurationDto(version: AgentVersion): AgentVersionConfigurationResponse {
  return {
    agentId: version.agentId,
    versionId: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    changelog: version.changelog,
    configuration: version.configuration as AgentConfigurationSnapshotV1,
  };
}

export function toOutboundCampaignDto(campaign: OutboundCampaign): OutboundCampaignResponse {
  return {
    id: campaign.id,
    organizationId: campaign.organizationId,
    agentId: campaign.agentId,
    agentVersionId: campaign.agentVersionId,
    name: campaign.name,
    description: campaign.description ?? null,
    status: campaign.status,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

export function toOutboundCallJobDto(job: OutboundCallJob): OutboundCallJobResponse {
  return {
    id: job.id,
    organizationId: job.organizationId,
    campaignId: job.campaignId ?? null,
    agentId: job.agentId,
    agentVersionId: job.agentVersionId,
    destinationPhone: job.destinationPhone,
    recipientName: job.recipientName ?? null,
    status: job.status,
    scheduledAt: job.scheduledAt.toISOString(),
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    idempotencyKey: job.idempotencyKey,
    callId: job.callId ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
