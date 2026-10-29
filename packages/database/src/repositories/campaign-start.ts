import { and, eq } from 'drizzle-orm';
import { outboundCampaignAudiences } from '../schema/campaign-audiences.js';
import { outboundCampaigns, type OutboundCampaignEntity } from '../schema/outbound.js';
import type { DatabaseExecutor } from './database-executor.js';
import {
  checkAgentReadiness,
  materializeCampaignJobs,
  type CampaignScope,
} from './campaign-job-materialization.js';

export const reject = <R extends string>(reason: R) => ({ kind: 'REJECTED' as const, reason });

export async function lockCampaign(tx: DatabaseExecutor, scope: CampaignScope) {
  const [row] = await tx
    .select()
    .from(outboundCampaigns)
    .where(
      and(
        eq(outboundCampaigns.id, scope.campaignId),
        eq(outboundCampaigns.organizationId, scope.organizationId),
      ),
    )
    .for('update');
  return row;
}

/** START: audiência obrigatória, agente pronto e ao menos um contato elegível. */
export async function startCampaign(
  tx: DatabaseExecutor,
  campaign: OutboundCampaignEntity,
  now: Date,
) {
  const scope = { organizationId: campaign.organizationId, campaignId: campaign.id };
  const [audience] = await tx
    .select()
    .from(outboundCampaignAudiences)
    .where(eq(outboundCampaignAudiences.campaignId, campaign.id));
  if (!audience) return reject('AUDIENCE_REQUIRED');
  const readiness = await checkAgentReadiness(tx, campaign);
  if (readiness) return reject(readiness);
  const startAt =
    audience.scheduledStartAt && audience.scheduledStartAt > now ? audience.scheduledStartAt : now;
  const created = await materializeCampaignJobs(tx, {
    ...scope,
    contactListId: audience.contactListId,
    scheduledAt: startAt,
  });
  if (created === 0) return reject('NO_ELIGIBLE_CONTACTS');
  return created;
}
