import { and, eq } from 'drizzle-orm';
import {
  ATTEMPT_OUTCOME_CLASSES,
  attemptStatesForOutcome,
  classifyAttemptOutcome,
  maskPhoneE164,
  type AttemptOutcomeClass,
  type CampaignAttemptRow,
  type CampaignAttemptSummary,
  type CampaignReport,
  type ListCampaignAttemptsQuery,
  type OutboundCampaignStatus,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import type { DatabaseExecutor } from './database-executor.js';
import { outboundCampaigns } from '../schema/outbound.js';
import { readCampaignProgress, type CampaignScope } from './campaign-job-materialization.js';
import {
  countAttemptsByState,
  listAttemptRows,
  sumCampaignCosts,
  type AttemptListRow,
  type AttemptStateCount,
} from './campaign-report-queries.js';

const iso = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString();

function summarize(
  rows: readonly AttemptStateCount[],
  status: OutboundCampaignStatus,
): CampaignAttemptSummary {
  const byOutcome = Object.fromEntries(ATTEMPT_OUTCOME_CLASSES.map((c) => [c, 0])) as Record<
    AttemptOutcomeClass,
    number
  >;
  let total = 0;
  let sent = 0;
  let review = 0;
  for (const row of rows) {
    byOutcome[classifyAttemptOutcome(row.state, status)] += row.total;
    total += row.total;
    sent += row.sent;
    review += row.review;
  }
  return { total, sent, requiresManualReview: review, byOutcome };
}

function toAttemptRow(row: AttemptListRow, status: OutboundCampaignStatus): CampaignAttemptRow {
  return {
    attemptId: row.id,
    jobId: row.jobId,
    attemptNumber: row.attemptNumber,
    destinationMasked: maskPhoneE164(row.destination),
    state: row.state,
    outcome: classifyAttemptOutcome(row.state, status),
    sent: row.sendStartedAt !== null,
    requiresManualReview: row.requiresManualReview,
    createdAt: iso(row.createdAt)!,
    sendStartedAt: iso(row.sendStartedAt),
    lastEventAt: iso(row.lastEventAt),
    callDurationSeconds: row.durationSeconds,
  };
}

/** A classe pedida é impossível no status atual (retida só existe em campanha pausada). */
function outcomeImpossible(outcome: AttemptOutcomeClass, status: OutboundCampaignStatus) {
  if (outcome === 'HELD_BY_PAUSE') return status !== 'PAUSED';
  return outcome === 'NOT_SENT_PENDING' && status === 'PAUSED';
}

async function campaignStatusOf(
  tx: DatabaseExecutor,
  scope: CampaignScope,
): Promise<OutboundCampaignStatus | null> {
  const [row] = await tx
    .select({ status: outboundCampaigns.status })
    .from(outboundCampaigns)
    .where(
      and(
        eq(outboundCampaigns.id, scope.campaignId),
        eq(outboundCampaigns.organizationId, scope.organizationId),
      ),
    );
  return row?.status ?? null;
}

/**
 * 008-MVP4 — leitura de relatórios da campanha, sempre escopada ao tenant.
 * Campanha de outro tenant (ou inexistente) → `null` (a API responde 404).
 */
export class DrizzleCampaignReportRepository {
  constructor(private readonly db: DatabaseInstance) {}

  /** Uma única fotografia consistente (REPEATABLE READ, somente leitura). */
  report(
    scope: CampaignScope,
    options: { readonly includeCosts: boolean },
  ): Promise<CampaignReport | null> {
    return this.db.transaction(
      async (tx) => {
        const status = await campaignStatusOf(tx, scope);
        if (!status) return null;
        const progress = await readCampaignProgress(tx, scope);
        const byState = await countAttemptsByState(tx, scope);
        const costs = options.includeCosts ? await sumCampaignCosts(tx, scope) : null;
        return {
          campaignId: scope.campaignId,
          campaignStatus: status,
          progress,
          attempts: summarize(byState, status),
          costs,
          dispositions: { available: false, reason: 'PROVIDER_INTEGRATION_PENDING' } as const,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async listAttempts(
    scope: CampaignScope,
    query: ListCampaignAttemptsQuery,
  ): Promise<CampaignAttemptRow[] | null> {
    const status = await campaignStatusOf(this.db, scope);
    if (!status) return null;
    if (query.outcome && outcomeImpossible(query.outcome, status)) return [];
    const rows = await listAttemptRows(this.db, scope, {
      limit: query.limit,
      offset: query.offset,
      states: query.outcome ? attemptStatesForOutcome(query.outcome) : null,
    });
    return rows.map((row) => toAttemptRow(row, status));
  }
}
