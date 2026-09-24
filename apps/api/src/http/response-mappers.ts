import type {
  AgentMetadataResponse,
  AgentVersionMetadataResponse,
  AgentVersionConfigurationResponse,
  AgentConfigurationSnapshotV1,
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
