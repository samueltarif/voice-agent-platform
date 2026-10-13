import { NotFoundError, BadRequestError } from '@voice-agent/errors';
import type { DatabaseInstance } from '../client/connection.js';
import { AgentRepository } from './agent-repository.js';
import { AgentVersionRepository } from './agent-version-repository.js';

export const AGENT_ASSOCIATION_NOT_FOUND_MESSAGE =
  'Knowledge document agent association not found for tenant';

export interface ValidateAgentAssociationInput {
  readonly organizationId: string;
  readonly agentId?: string | undefined;
  readonly agentVersionId?: string | undefined;
}

export async function validateAgentAssociation(
  db: DatabaseInstance,
  input: ValidateAgentAssociationInput,
): Promise<void> {
  const { organizationId, agentId, agentVersionId } = input;
  if (!agentId && !agentVersionId) return;
  if (agentVersionId && !agentId) {
    throw new BadRequestError('Knowledge document agentVersionId requires agentId');
  }
  if (!agentId) return;

  const agent = await new AgentRepository(db).getAgentById({ organizationId, agentId });
  if (!agent) throw new NotFoundError(AGENT_ASSOCIATION_NOT_FOUND_MESSAGE);

  if (agentVersionId) {
    await validateAgentVersionAssociation(db, { organizationId, agentId, agentVersionId });
  }
}

async function validateAgentVersionAssociation(
  db: DatabaseInstance,
  input: { organizationId: string; agentId: string; agentVersionId: string },
): Promise<void> {
  const version = await new AgentVersionRepository(db).getVersionById({
    organizationId: input.organizationId,
    agentId: input.agentId,
    versionId: input.agentVersionId,
  });
  if (!version) throw new NotFoundError(AGENT_ASSOCIATION_NOT_FOUND_MESSAGE);
}
