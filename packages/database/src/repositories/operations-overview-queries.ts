import { sql } from 'drizzle-orm';
import type {
  CampaignCostSummary,
  ListOperationsAttemptsQuery,
  OutboundAttemptState,
  OutboundCampaignStatus,
} from '@voice-agent/contracts';
import type { DatabaseExecutor } from './database-executor.js';

/** Janela da visão operacional: organização + início do período. */
export interface OperationsWindow {
  readonly organizationId: string;
  readonly since: Date;
}

export interface OrgAttemptStateCount extends Record<string, unknown> {
  readonly state: OutboundAttemptState;
  readonly paused: boolean;
  readonly total: number;
  readonly sent: number;
  readonly review: number;
}

/** Tentativas da janela por estado e por "campanha pausada" (classificação no domínio). */
export async function countOrgAttempts(
  tx: DatabaseExecutor,
  w: OperationsWindow,
): Promise<OrgAttemptStateCount[]> {
  const result = await tx.execute<OrgAttemptStateCount>(sql`
    SELECT a.state, coalesce(c.status = 'PAUSED', false) AS paused,
      count(*)::int AS total,
      count(*) FILTER (WHERE a.send_started_at IS NOT NULL)::int AS sent,
      count(*) FILTER (WHERE a.requires_manual_review)::int AS review
    FROM call_attempts a
    LEFT JOIN outbound_campaigns c ON c.id = a.campaign_id AND c.organization_id = a.organization_id
    WHERE a.organization_id = ${w.organizationId} AND a.created_at >= ${w.since}
    GROUP BY a.state, coalesce(c.status = 'PAUSED', false)`);
  return result.rows;
}

export async function countCampaignsByStatus(
  tx: DatabaseExecutor,
  organizationId: string,
): Promise<{ status: OutboundCampaignStatus; total: number }[]> {
  const result = await tx.execute<{ status: OutboundCampaignStatus; total: number }>(sql`
    SELECT status, count(*)::int AS total FROM outbound_campaigns
    WHERE organization_id = ${organizationId} GROUP BY status`);
  return result.rows;
}

export async function listRunningCampaigns(
  tx: DatabaseExecutor,
  organizationId: string,
): Promise<{ id: string; name: string; status: OutboundCampaignStatus }[]> {
  const result = await tx.execute<{ id: string; name: string; status: OutboundCampaignStatus }>(sql`
    SELECT id, name, status FROM outbound_campaigns
    WHERE organization_id = ${organizationId} AND status IN ('ACTIVE', 'PAUSED')
    ORDER BY updated_at DESC, id DESC LIMIT 5`);
  return result.rows;
}

export async function countLiveSessions(
  tx: DatabaseExecutor,
  organizationId: string,
): Promise<number> {
  const result = await tx.execute<{ total: number }>(sql`
    SELECT count(*)::int AS total FROM call_sessions
    WHERE organization_id = ${organizationId}
      AND runtime_state IN ('CONNECTING', 'ACTIVE', 'ENDING')`);
  return result.rows[0]?.total ?? 0;
}

type CostRow = Record<string, number | string | null>;

/** Liquidado na janela (`settled_at`) e reservado aberto agora — apenas do ledger. */
export async function sumOrgCosts(
  tx: DatabaseExecutor,
  w: OperationsWindow,
): Promise<CampaignCostSummary> {
  const result = await tx.execute<CostRow>(sql`
    SELECT
      (SELECT currency FROM outbound_budget_ledgers WHERE organization_id = ${w.organizationId}) AS currency,
      coalesce(sum(settled_carrier_minor_units) FILTER (WHERE status = 'COMMITTED' AND settled_at >= ${w.since}), 0)::int AS sc,
      coalesce(sum(settled_conversational_minor_units) FILTER (WHERE status = 'COMMITTED' AND settled_at >= ${w.since}), 0)::int AS sv,
      coalesce(sum(settled_amount_minor_units) FILTER (WHERE status = 'COMMITTED' AND settled_at >= ${w.since}), 0)::int AS st,
      count(*) FILTER (WHERE status = 'COMMITTED' AND settled_at >= ${w.since})::int AS sn,
      coalesce(sum(reserved_carrier_minor_units) FILTER (WHERE status = 'RESERVED'), 0)::int AS rc,
      coalesce(sum(reserved_conversational_minor_units) FILTER (WHERE status = 'RESERVED'), 0)::int AS rv,
      coalesce(sum(reserved_amount_minor_units) FILTER (WHERE status = 'RESERVED'), 0)::int AS rt,
      count(*) FILTER (WHERE status = 'RESERVED')::int AS rn
    FROM outbound_budget_reservations
    WHERE organization_id = ${w.organizationId}`);
  const r = result.rows[0] ?? {};
  const n = (key: string) => Number(r[key] ?? 0);
  return {
    currency: typeof r.currency === 'string' ? r.currency : null,
    settled: { carrier: n('sc'), conversational: n('sv'), total: n('st') },
    settledAttempts: n('sn'),
    reservedOpen: { carrier: n('rc'), conversational: n('rv'), total: n('rt') },
    openReservations: n('rn'),
  };
}

export interface OrgAttemptListRow extends Record<string, unknown> {
  readonly id: string;
  readonly jobId: string;
  readonly attemptNumber: number;
  readonly destination: string;
  readonly state: OutboundAttemptState;
  readonly requiresManualReview: boolean;
  readonly createdAt: Date | string;
  readonly sendStartedAt: Date | string | null;
  readonly lastEventAt: Date | string | null;
  readonly durationSeconds: number | null;
  readonly campaignId: string | null;
  readonly campaignName: string | null;
  readonly campaignStatus: OutboundCampaignStatus | null;
}

/** Filtro por estado; `paused` restringe retidas (true) ou não enviadas comuns (false). */
export interface OrgAttemptFilter {
  readonly states: readonly OutboundAttemptState[] | null;
  readonly paused: boolean | null;
}

export async function listOrgAttemptRows(
  tx: DatabaseExecutor,
  w: OperationsWindow,
  page: Pick<ListOperationsAttemptsQuery, 'limit' | 'offset'> & OrgAttemptFilter,
): Promise<OrgAttemptListRow[]> {
  const stateFilter = page.states
    ? sql`AND a.state::text = ANY(${`{${page.states.join(',')}}`}::text[])`
    : sql``;
  const pausedFilter =
    page.paused === null ? sql`` : sql`AND coalesce(c.status = 'PAUSED', false) = ${page.paused}`;
  const result = await tx.execute<OrgAttemptListRow>(sql`
    SELECT a.id, a.job_id AS "jobId", a.attempt_number AS "attemptNumber",
      j.destination_phone AS destination, a.state,
      a.requires_manual_review AS "requiresManualReview", a.created_at AS "createdAt",
      a.send_started_at AS "sendStartedAt", a.last_event_at AS "lastEventAt",
      CASE WHEN s.ended_at IS NOT NULL
        THEN floor(extract(epoch FROM (s.ended_at - s.started_at)))::int END AS "durationSeconds",
      c.id AS "campaignId", c.name AS "campaignName", c.status AS "campaignStatus"
    FROM call_attempts a
    JOIN outbound_call_jobs j ON j.id = a.job_id AND j.organization_id = a.organization_id
    LEFT JOIN outbound_campaigns c ON c.id = a.campaign_id AND c.organization_id = a.organization_id
    LEFT JOIN call_sessions s ON s.id = a.call_session_id AND s.organization_id = a.organization_id
    WHERE a.organization_id = ${w.organizationId} AND a.created_at >= ${w.since}
      ${stateFilter} ${pausedFilter}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ${page.limit} OFFSET ${page.offset}`);
  return result.rows;
}
