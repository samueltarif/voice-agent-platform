import { and, eq, sql } from 'drizzle-orm';
import { outboundCampaigns } from '../schema/outbound.js';
import type { CallAttemptEntity } from '../schema/call-attempts.js';
import type { DatabaseExecutor } from './database-executor.js';
import { cancelSuppressedAttempt } from './send-time-suppression-guard.js';

export type CampaignSendRefusal = 'CAMPAIGN_PAUSED' | 'CAMPAIGN_CANCELED';

/**
 * 008-MVP2 — o status da campanha também vale na barreira de envio, não só no
 * claim do job. A leitura usa `FOR SHARE`: transições (que travam a campanha
 * `FOR UPDATE`) e decisões de envio ficam linearizadas — ou o envio ocorre
 * antes da transição (e segue sua FSM), ou enxerga o novo status.
 * Campanha ausente com referência na tentativa → recusa (fail-closed).
 */
async function readCampaignStatus(
  executor: DatabaseExecutor,
  row: CallAttemptEntity,
): Promise<string | null> {
  const [campaign] = await executor
    .select({ status: outboundCampaigns.status })
    .from(outboundCampaigns)
    .where(
      and(
        eq(outboundCampaigns.id, row.campaignId!),
        eq(outboundCampaigns.organizationId, row.organizationId),
      ),
    )
    .for('share');
  return campaign?.status ?? null;
}

export async function campaignSendRefusal(
  executor: DatabaseExecutor,
  row: CallAttemptEntity,
): Promise<CampaignSendRefusal | null> {
  if (!row.campaignId) return null;
  const status = await readCampaignStatus(executor, row);
  if (status === 'PAUSED') return 'CAMPAIGN_PAUSED';
  if (status === 'ACTIVE' || status === 'DRAFT') return null;
  return 'CAMPAIGN_CANCELED';
}

/**
 * Campanha cancelada/concluída: a tentativa (nada enviado) é cancelada — o
 * orçamento passa a ser liberável com prova — e o job reivindicado é
 * encerrado como CANCELED. Pausa NÃO altera nada: a tentativa fica pendente
 * para a retomada (orçamento permanece encumberado, fail-closed).
 */
export async function applyCampaignSendRefusal(
  executor: DatabaseExecutor,
  row: CallAttemptEntity,
  ctx: { readonly refusal: CampaignSendRefusal; readonly now: Date },
): Promise<void> {
  if (ctx.refusal !== 'CAMPAIGN_CANCELED') return;
  await cancelSuppressedAttempt(executor, row, ctx.now);
  await executor.execute(sql`
    UPDATE outbound_call_jobs SET status = 'CANCELED', updated_at = ${ctx.now}
    WHERE id = ${row.jobId} AND organization_id = ${row.organizationId} AND status = 'CLAIMED'
  `);
}
