import { and, eq } from 'drizzle-orm';
import {
  resolveCampaignTransition,
  type CampaignAction,
  type CampaignActionOutcome,
  type CampaignProgress,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { outboundCampaignAudiences } from '../schema/campaign-audiences.js';
import { contactLists } from '../schema/contacts.js';
import { outboundCampaigns } from '../schema/outbound.js';
import type { DatabaseExecutor } from './database-executor.js';
import {
  cancelPendingCampaignJobs,
  readCampaignProgress,
  type CampaignScope,
} from './campaign-job-materialization.js';
import { lockCampaign, reject, startCampaign } from './campaign-start.js';
import { classifyPostgresFailure } from './outbound-persistence-errors.js';

export type AssignAudienceOutcome =
  | { readonly kind: 'ASSIGNED' }
  | { readonly kind: 'REJECTED'; readonly reason: 'NOT_FOUND' | 'NOT_DRAFT' | 'LIST_NOT_FOUND' };

/** Corrida rara: número suprimido entre a seleção e o INSERT (trigger da 008-MVP1). */
export type CampaignActionResult =
  CampaignActionOutcome | { readonly kind: 'REJECTED'; readonly reason: 'AUDIENCE_CHANGED_RETRY' };

type RejectedOutcome = Extract<CampaignActionOutcome, { kind: 'REJECTED' }>;

/** Sinaliza rollback de uma decisão de negócio tomada DENTRO da transação. */
class RejectedAction extends Error {
  constructor(readonly outcome: RejectedOutcome) {
    super(`campaign action rejected: ${outcome.reason}`);
  }
}

/**
 * 008-MVP2 — audiência e ciclo de vida da campanha. Toda transição trava a
 * campanha (escopo de tenant) e é atômica com seus efeitos nos jobs; qualquer
 * rejeição desfaz a transação inteira.
 */
export class DrizzleCampaignLifecycleRepository {
  constructor(private readonly db: DatabaseInstance) {}

  assignAudience(
    input: CampaignScope & {
      readonly contactListId: string;
      readonly scheduledStartAt?: Date | undefined;
    },
  ): Promise<AssignAudienceOutcome> {
    return this.db.transaction(async (tx) => {
      const campaign = await lockCampaign(tx, input);
      if (!campaign) return reject('NOT_FOUND');
      if (campaign.status !== 'DRAFT') return reject('NOT_DRAFT');
      const [list] = await tx
        .select({ id: contactLists.id })
        .from(contactLists)
        .where(
          and(
            eq(contactLists.id, input.contactListId),
            eq(contactLists.organizationId, input.organizationId),
          ),
        );
      if (!list) return reject('LIST_NOT_FOUND');
      const values = {
        campaignId: input.campaignId,
        organizationId: input.organizationId,
        contactListId: input.contactListId,
        scheduledStartAt: input.scheduledStartAt ?? null,
      };
      await tx
        .insert(outboundCampaignAudiences)
        .values(values)
        .onConflictDoUpdate({ target: outboundCampaignAudiences.campaignId, set: values });
      return { kind: 'ASSIGNED' };
    });
  }

  async applyAction(
    input: CampaignScope & { readonly action: CampaignAction; readonly now: Date },
  ): Promise<CampaignActionResult> {
    try {
      return await this.db.transaction((tx) => this.transition(tx, input));
    } catch (error) {
      if (error instanceof RejectedAction) return error.outcome;
      const failure = classifyPostgresFailure(error);
      if (failure.constraint === 'outbound_call_jobs_destination_not_suppressed') {
        return reject('AUDIENCE_CHANGED_RETRY');
      }
      throw error;
    }
  }

  private async transition(
    tx: DatabaseExecutor,
    input: CampaignScope & { readonly action: CampaignAction; readonly now: Date },
  ): Promise<CampaignActionOutcome> {
    const campaign = await lockCampaign(tx, input);
    if (!campaign) return reject('NOT_FOUND');
    const next = resolveCampaignTransition(campaign.status, input.action);
    if (!next.ok) return reject(next.reason);
    let jobsCreated = 0;
    let jobsCanceled = 0;
    if (input.action === 'START') {
      const started = await startCampaign(tx, campaign, input.now);
      if (typeof started !== 'number') throw new RejectedAction(started);
      jobsCreated = started;
    }
    if (input.action === 'CANCEL')
      jobsCanceled = await cancelPendingCampaignJobs(tx, input, input.now);
    await tx
      .update(outboundCampaigns)
      .set({ status: next.to, updatedAt: input.now })
      .where(
        and(
          eq(outboundCampaigns.id, campaign.id),
          eq(outboundCampaigns.organizationId, campaign.organizationId),
        ),
      );
    return { kind: 'TRANSITIONED', status: next.to, jobsCreated, jobsCanceled };
  }

  getAudience(scope: CampaignScope) {
    return this.db
      .select()
      .from(outboundCampaignAudiences)
      .where(
        and(
          eq(outboundCampaignAudiences.campaignId, scope.campaignId),
          eq(outboundCampaignAudiences.organizationId, scope.organizationId),
        ),
      )
      .then((rows) => rows[0] ?? null);
  }

  progress(scope: CampaignScope): Promise<CampaignProgress> {
    return readCampaignProgress(this.db, scope);
  }
}
