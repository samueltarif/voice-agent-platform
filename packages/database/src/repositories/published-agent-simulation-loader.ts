import { AppError } from '@voice-agent/errors';
import {
  agentConfigurationSnapshotV1Schema,
  KNOWLEDGE_PREVIEW_ERROR_CODES,
  type AgentConfigurationSnapshotV1,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { AgentRepository } from './agent-repository.js';
import { AgentVersionRepository } from './agent-version-repository.js';

export interface PublishedAgentForSimulation {
  readonly agentId: string;
  readonly agentName: string;
  readonly agentVersionId: string;
  readonly versionNumber: number;
  readonly snapshot: AgentConfigurationSnapshotV1;
}

/**
 * Simulador do Agent Studio (DEC-061): o mesmo vínculo de uma chamada, lido no
 * servidor. Agente da organização da sessão, ATIVO, com versão PUBLICADA e
 * snapshot válido. Agente inexistente, de outra organização ou arquivado
 * recebem a mesma resposta (não revela existência).
 */
export async function loadPublishedAgentForSimulation(
  db: DatabaseInstance,
  input: { readonly organizationId: string; readonly agentId: string },
): Promise<PublishedAgentForSimulation> {
  const agent = await new AgentRepository(db).getAgentById(input);
  if (!agent || agent.status !== 'ACTIVE') {
    throw new AppError(
      'Agent is not available',
      409,
      KNOWLEDGE_PREVIEW_ERROR_CODES.AGENT_UNAVAILABLE,
    );
  }
  const version = await new AgentVersionRepository(db).getCurrentPublishedVersion(input);
  if (!version) {
    throw new AppError(
      'Agent has no published version',
      409,
      KNOWLEDGE_PREVIEW_ERROR_CODES.AGENT_NOT_PUBLISHED,
    );
  }
  return {
    agentId: agent.id,
    agentName: agent.name,
    agentVersionId: version.id,
    versionNumber: version.versionNumber,
    snapshot: agentConfigurationSnapshotV1Schema.parse(version.configuration),
  };
}
