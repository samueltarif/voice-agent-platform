import { and, eq, sql } from 'drizzle-orm';
import { NotFoundError } from '@voice-agent/errors';
import { agents } from '../schema/agents.js';
import type { DatabaseExecutor } from './database-executor.js';

export async function allocateNextAgentVersionNumber(
  db: DatabaseExecutor,
  organizationId: string,
  agentId: string,
): Promise<number> {
  const [agent] = await db
    .select({
      id: agents.id,
      nextVersionNumber: agents.nextVersionNumber,
    })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.organizationId, organizationId)))
    .for('update');

  if (!agent) {
    throw new NotFoundError(`Agent '${agentId}' not found in organization`);
  }

  const allocated = agent.nextVersionNumber;

  await db
    .update(agents)
    .set({
      nextVersionNumber: sql`${agents.nextVersionNumber} + 1`,
    })
    .where(and(eq(agents.id, agentId), eq(agents.organizationId, organizationId)));

  return allocated;
}

export const resolveNextAgentVersionNumber = allocateNextAgentVersionNumber;
