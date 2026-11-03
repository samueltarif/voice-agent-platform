import {
  ATTEMPT_OUTCOME_CLASSES,
  OUTBOUND_CAMPAIGN_STATUSES,
  attemptStatesForOutcome,
  classifyAttemptOutcome,
  maskPhoneE164,
  type AttemptOutcomeClass,
  type CampaignAttemptSummary,
  type ListOperationsAttemptsQuery,
  type OperationsAttemptRow,
  type OperationsOverview,
  type OutboundCampaignStatus,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import type { DatabaseExecutor } from './database-executor.js';
import { readCampaignProgress } from './campaign-job-materialization.js';
import {
  countCampaignsByStatus,
  countLiveSessions,
  countOrgAttempts,
  listOrgAttemptRows,
  listRunningCampaigns,
  sumOrgCosts,
  type OperationsWindow,
  type OrgAttemptFilter,
  type OrgAttemptListRow,
  type OrgAttemptStateCount,
} from './operations-overview-queries.js';

const DAY_MS = 86_400_000;
const iso = (v: Date | string | null) => (v === null ? null : new Date(v).toISOString());
/** Tentativa sem campanha (fluxo em lote 007F) nunca está "retida pela pausa". */
const statusOf = (paused: boolean): OutboundCampaignStatus => (paused ? 'PAUSED' : 'ACTIVE');

function summarize(rows: readonly OrgAttemptStateCount[]): CampaignAttemptSummary {
  const byOutcome = Object.fromEntries(ATTEMPT_OUTCOME_CLASSES.map((c) => [c, 0])) as Record<
    AttemptOutcomeClass,
    number
  >;
  let total = 0;
  let sent = 0;
  let review = 0;
  for (const row of rows) {
    byOutcome[classifyAttemptOutcome(row.state, statusOf(row.paused))] += row.total;
    total += row.total;
    sent += row.sent;
    review += row.review;
  }
  return { total, sent, requiresManualReview: review, byOutcome };
}

function filterFor(outcome: AttemptOutcomeClass | undefined): OrgAttemptFilter {
  if (!outcome) return { states: null, paused: null };
  const states = attemptStatesForOutcome(outcome);
  if (outcome === 'HELD_BY_PAUSE') return { states, paused: true };
  return { states, paused: outcome === 'NOT_SENT_PENDING' ? false : null };
}

function toRow(row: OrgAttemptListRow): OperationsAttemptRow {
  return {
    attemptId: row.id,
    jobId: row.jobId,
    attemptNumber: row.attemptNumber,
    destinationMasked: maskPhoneE164(row.destination),
    state: row.state,
    outcome: classifyAttemptOutcome(row.state, row.campaignStatus ?? 'ACTIVE'),
    sent: row.sendStartedAt !== null,
    requiresManualReview: row.requiresManualReview,
    createdAt: iso(row.createdAt)!,
    sendStartedAt: iso(row.sendStartedAt),
    lastEventAt: iso(row.lastEventAt),
    callDurationSeconds: row.durationSeconds,
    campaignId: row.campaignId,
    campaignName: row.campaignName,
  };
}

async function campaignsOverview(tx: DatabaseExecutor, organizationId: string) {
  const byStatus = Object.fromEntries(OUTBOUND_CAMPAIGN_STATUSES.map((s) => [s, 0])) as Record<
    OutboundCampaignStatus,
    number
  >;
  for (const row of await countCampaignsByStatus(tx, organizationId))
    byStatus[row.status] = row.total;
  const running = [];
  for (const c of await listRunningCampaigns(tx, organizationId)) {
    const progress = await readCampaignProgress(tx, { organizationId, campaignId: c.id });
    running.push({ campaignId: c.id, name: c.name, status: c.status, progress });
  }
  return { byStatus, running };
}

export interface OverviewOptions {
  readonly days: number;
  readonly includeCosts: boolean;
  readonly now: Date;
}

/**
 * 008-MVP4c — visão operacional da organização, sempre escopada ao tenant e
 * lida numa única fotografia (REPEATABLE READ, somente leitura).
 */
export class DrizzleOperationsOverviewRepository {
  constructor(private readonly db: DatabaseInstance) {}

  overview(organizationId: string, options: OverviewOptions): Promise<OperationsOverview> {
    const w: OperationsWindow = {
      organizationId,
      since: new Date(options.now.getTime() - options.days * DAY_MS),
    };
    return this.db.transaction(
      async (tx) => ({
        periodDays: options.days,
        since: w.since.toISOString(),
        campaigns: await campaignsOverview(tx, organizationId),
        attempts: summarize(await countOrgAttempts(tx, w)),
        liveSessions: await countLiveSessions(tx, organizationId),
        costs: options.includeCosts ? await sumOrgCosts(tx, w) : null,
        handoffs: { available: false, reason: 'NOT_PERSISTED' } as const,
        dispositions: { available: false, reason: 'PROVIDER_INTEGRATION_PENDING' } as const,
      }),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async listAttempts(
    organizationId: string,
    query: ListOperationsAttemptsQuery & { readonly now: Date },
  ): Promise<OperationsAttemptRow[]> {
    const w = { organizationId, since: new Date(query.now.getTime() - query.days * DAY_MS) };
    const rows = await listOrgAttemptRows(this.db, w, {
      limit: query.limit,
      offset: query.offset,
      ...filterFor(query.outcome),
    });
    return rows.map(toRow);
  }
}
