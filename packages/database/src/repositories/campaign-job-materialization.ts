import { and, eq, sql } from 'drizzle-orm';
import type { CampaignProgress } from '@voice-agent/contracts';
import { agents, agentVersions } from '../schema/agents.js';
import type { DatabaseExecutor } from './database-executor.js';

export interface CampaignScope {
  readonly organizationId: string;
  readonly campaignId: string;
}

/** Integridade no START: agente ATIVO e versão PUBLICADA, ambos do mesmo tenant. */
export async function checkAgentReadiness(
  tx: DatabaseExecutor,
  input: {
    readonly organizationId: string;
    readonly agentId: string;
    readonly agentVersionId: string;
  },
): Promise<'AGENT_NOT_ACTIVE' | 'AGENT_VERSION_NOT_PUBLISHED' | null> {
  const [row] = await tx
    .select({ agentStatus: agents.status, versionStatus: agentVersions.status })
    .from(agentVersions)
    .innerJoin(
      agents,
      and(
        eq(agents.id, agentVersions.agentId),
        eq(agents.organizationId, agentVersions.organizationId),
      ),
    )
    .where(
      and(
        eq(agentVersions.id, input.agentVersionId),
        eq(agentVersions.agentId, input.agentId),
        eq(agentVersions.organizationId, input.organizationId),
      ),
    );
  if (!row || row.versionStatus !== 'PUBLISHED') return 'AGENT_VERSION_NOT_PUBLISHED';
  return row.agentStatus === 'ACTIVE' ? null : 'AGENT_NOT_ACTIVE';
}

/**
 * Materializa UM job por contato ELEGÍVEL da lista (supressões excluídas na
 * própria consulta; o trigger da 008-MVP1 continua como barreira final).
 * Chave idempotente por (campanha, contato): reexecução nunca duplica jobs.
 */
export async function materializeCampaignJobs(
  tx: DatabaseExecutor,
  input: CampaignScope & { readonly contactListId: string; readonly scheduledAt: Date },
): Promise<number> {
  const result = await tx.execute<{ id: string }>(sql`
    INSERT INTO outbound_call_jobs (
      organization_id, campaign_id, agent_id, agent_version_id,
      destination_phone, recipient_name, status, scheduled_at, idempotency_key
    )
    SELECT c.organization_id, c.id, c.agent_id, c.agent_version_id,
           k.phone_e164, k.display_name, 'SCHEDULED', ${input.scheduledAt},
           'campaign:' || c.id || ':contact:' || k.id
    FROM outbound_campaigns c
    JOIN contact_list_members m
      ON m.list_id = ${input.contactListId} AND m.organization_id = c.organization_id
    JOIN contacts k
      ON k.id = m.contact_id AND k.organization_id = m.organization_id
    WHERE c.id = ${input.campaignId} AND c.organization_id = ${input.organizationId}
      AND NOT EXISTS (
        SELECT 1 FROM contact_suppressions s
        WHERE s.organization_id = k.organization_id AND s.phone_e164 = k.phone_e164
      )
    ON CONFLICT (organization_id, idempotency_key) DO NOTHING
    RETURNING id`);
  return result.rows.length;
}

/** Cancela apenas jobs ainda não reivindicados; jobs em andamento seguem sua FSM. */
export async function cancelPendingCampaignJobs(
  tx: DatabaseExecutor,
  scope: CampaignScope,
  now: Date,
): Promise<number> {
  const result = await tx.execute<{ id: string }>(sql`
    UPDATE outbound_call_jobs SET status = 'CANCELED', updated_at = ${now}
    WHERE organization_id = ${scope.organizationId} AND campaign_id = ${scope.campaignId}
      AND status IN ('SCHEDULED', 'FAILED_RETRYABLE')
    RETURNING id`);
  return result.rows.length;
}

const EMPTY_PROGRESS: CampaignProgress = {
  total: 0,
  scheduled: 0,
  inProgress: 0,
  heldByPause: 0,
  completed: 0,
  failed: 0,
  canceled: 0,
};

/**
 * Progresso real dos jobs. 008-MVP4: job reivindicado de campanha PAUSADA sem
 * tentativa enviada (`send_started_at`) está retido pela pausa — não discando
 * — e sai de "em andamento".
 */
export async function readCampaignProgress(
  tx: DatabaseExecutor,
  scope: CampaignScope,
): Promise<CampaignProgress> {
  const result = await tx.execute<Record<keyof CampaignProgress | 'running', number>>(sql`
    SELECT
      count(*)::int AS "total",
      count(*) FILTER (WHERE j.status IN ('SCHEDULED', 'FAILED_RETRYABLE'))::int AS "scheduled",
      count(*) FILTER (WHERE j.status IN ('CLAIMED', 'DISPATCHED'))::int AS "running",
      count(*) FILTER (
        WHERE j.status IN ('CLAIMED', 'DISPATCHED') AND c.status = 'PAUSED'
          AND NOT EXISTS (
            SELECT 1 FROM call_attempts a
            WHERE a.organization_id = j.organization_id AND a.job_id = j.id
              AND a.send_started_at IS NOT NULL
          )
      )::int AS "heldByPause",
      count(*) FILTER (WHERE j.status = 'COMPLETED')::int AS "completed",
      count(*) FILTER (WHERE j.status = 'FAILED_TERMINAL')::int AS "failed",
      count(*) FILTER (WHERE j.status = 'CANCELED')::int AS "canceled"
    FROM outbound_call_jobs j
    JOIN outbound_campaigns c ON c.id = j.campaign_id AND c.organization_id = j.organization_id
    WHERE j.organization_id = ${scope.organizationId} AND j.campaign_id = ${scope.campaignId}`);
  const row = result.rows[0];
  if (!row) return EMPTY_PROGRESS;
  const { running, inProgress: _unused, ...counts } = row;
  return { ...counts, inProgress: running - counts.heldByPause };
}
