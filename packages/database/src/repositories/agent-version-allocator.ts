import { and, eq, sql } from 'drizzle-orm';
import { agentVersions } from '../schema/agents.js';
import { auditLogs } from '../schema/audit.js';
import type { DatabaseExecutor } from './database-executor.js';

export async function resolveNextAgentVersionNumber(
  db: DatabaseExecutor,
  organizationId: string,
  agentId: string,
): Promise<number> {
  const [dbMaxRow] = await db
    .select({ max: sql<number>`COALESCE(MAX(${agentVersions.versionNumber}), 0)::int` })
    .from(agentVersions)
    .where(eq(agentVersions.agentId, agentId));

  const auditRows = await db
    .select({ metadata: auditLogs.metadata })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.organizationId, organizationId),
        eq(auditLogs.targetId, agentId),
        eq(auditLogs.action, 'agent.draft_created'),
      ),
    );

  let maxAuditVersion = 0;
  for (const row of auditRows) {
    if (!row.metadata) continue;
    try {
      const parsed = JSON.parse(row.metadata) as { versionNumber?: number };
      if (typeof parsed.versionNumber === 'number' && parsed.versionNumber > maxAuditVersion) {
        maxAuditVersion = parsed.versionNumber;
      }
    } catch {
      // ignore non-json metadata
    }
  }

  return Math.max(dbMaxRow?.max ?? 0, maxAuditVersion) + 1;
}
