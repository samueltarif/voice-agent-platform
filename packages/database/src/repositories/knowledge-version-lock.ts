import { and, eq } from 'drizzle-orm';
import { NotFoundError } from '@voice-agent/errors';
import type { DatabaseInstance } from '../client/connection.js';
import { agentVersions } from '../schema/agents.js';
import { AGENT_ASSOCIATION_NOT_FOUND_MESSAGE } from './knowledge-agent-association.js';

export interface VersionLockInput {
  readonly organizationId: string;
  readonly agentId?: string | undefined;
  readonly agentVersionId?: string | undefined;
}

export async function lockReferencedVersion(
  tx: Parameters<Parameters<DatabaseInstance['transaction']>[0]>[0],
  input: VersionLockInput,
): Promise<void> {
  if (!input.agentId || !input.agentVersionId) return;
  const [version] = await tx
    .select({ id: agentVersions.id })
    .from(agentVersions)
    .where(
      and(
        eq(agentVersions.id, input.agentVersionId),
        eq(agentVersions.agentId, input.agentId),
        eq(agentVersions.organizationId, input.organizationId),
      ),
    )
    .for('update');
  if (!version) throw new NotFoundError(AGENT_ASSOCIATION_NOT_FOUND_MESSAGE);
}
