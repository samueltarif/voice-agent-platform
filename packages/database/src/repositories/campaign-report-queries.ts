import { sql } from 'drizzle-orm';
import type {
  CampaignCostSummary,
  ListCampaignAttemptsQuery,
  OutboundAttemptState,
} from '@voice-agent/contracts';
import type { DatabaseExecutor } from './database-executor.js';
import type { CampaignScope } from './campaign-job-materialization.js';

/** Contagem de tentativas por estado persistido (classificação feita no domínio). */
export interface AttemptStateCount extends Record<string, unknown> {
  readonly state: OutboundAttemptState;
  readonly total: number;
  readonly sent: number;
  readonly review: number;
}

export async function countAttemptsByState(
  tx: DatabaseExecutor,
  scope: CampaignScope,
): Promise<AttemptStateCount[]> {
  const result = await tx.execute<AttemptStateCount>(sql`
    SELECT state,
      count(*)::int AS total,
      count(*) FILTER (WHERE send_started_at IS NOT NULL)::int AS sent,
      count(*) FILTER (WHERE requires_manual_review)::int AS review
    FROM call_attempts
    WHERE organization_id = ${scope.organizationId} AND campaign_id = ${scope.campaignId}
    GROUP BY state`);
  return result.rows;
}

type CostRow = Record<string, number | string | null>;

/** Custos apenas do ledger: COMMITTED = liquidado; RESERVED = estimativa ainda reservada. */
export async function sumCampaignCosts(
  tx: DatabaseExecutor,
  scope: CampaignScope,
): Promise<CampaignCostSummary> {
  const result = await tx.execute<CostRow>(sql`
    SELECT
      (SELECT currency FROM outbound_budget_ledgers WHERE organization_id = ${scope.organizationId}) AS currency,
      coalesce(sum(r.settled_carrier_minor_units) FILTER (WHERE r.status = 'COMMITTED'), 0)::int AS sc,
      coalesce(sum(r.settled_conversational_minor_units) FILTER (WHERE r.status = 'COMMITTED'), 0)::int AS sv,
      coalesce(sum(r.settled_amount_minor_units) FILTER (WHERE r.status = 'COMMITTED'), 0)::int AS st,
      count(*) FILTER (WHERE r.status = 'COMMITTED')::int AS sn,
      coalesce(sum(r.reserved_carrier_minor_units) FILTER (WHERE r.status = 'RESERVED'), 0)::int AS rc,
      coalesce(sum(r.reserved_conversational_minor_units) FILTER (WHERE r.status = 'RESERVED'), 0)::int AS rv,
      coalesce(sum(r.reserved_amount_minor_units) FILTER (WHERE r.status = 'RESERVED'), 0)::int AS rt,
      count(*) FILTER (WHERE r.status = 'RESERVED')::int AS rn
    FROM outbound_budget_reservations r
    JOIN call_attempts a ON a.id = r.attempt_id AND a.organization_id = r.organization_id
    WHERE a.organization_id = ${scope.organizationId} AND a.campaign_id = ${scope.campaignId}`);
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

export interface AttemptListRow extends Record<string, unknown> {
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
}

export async function listAttemptRows(
  tx: DatabaseExecutor,
  scope: CampaignScope,
  page: Pick<ListCampaignAttemptsQuery, 'limit' | 'offset'> & {
    readonly states: readonly OutboundAttemptState[] | null;
  },
): Promise<AttemptListRow[]> {
  const stateFilter = page.states
    ? sql`AND a.state::text = ANY(${`{${page.states.join(',')}}`}::text[])`
    : sql``;
  const result = await tx.execute<AttemptListRow>(sql`
    SELECT a.id, a.job_id AS "jobId", a.attempt_number AS "attemptNumber",
      j.destination_phone AS destination, a.state,
      a.requires_manual_review AS "requiresManualReview", a.created_at AS "createdAt",
      a.send_started_at AS "sendStartedAt", a.last_event_at AS "lastEventAt",
      CASE WHEN s.ended_at IS NOT NULL
        THEN floor(extract(epoch FROM (s.ended_at - s.started_at)))::int END AS "durationSeconds"
    FROM call_attempts a
    JOIN outbound_call_jobs j ON j.id = a.job_id AND j.organization_id = a.organization_id
    LEFT JOIN call_sessions s ON s.id = a.call_session_id AND s.organization_id = a.organization_id
    WHERE a.organization_id = ${scope.organizationId} AND a.campaign_id = ${scope.campaignId}
      ${stateFilter}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ${page.limit} OFFSET ${page.offset}`);
  return result.rows;
}
