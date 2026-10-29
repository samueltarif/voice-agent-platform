import { z } from 'zod';
import type { OutboundCampaignStatus } from './outbound-contracts.js';

/**
 * 008-MVP2 — ciclo de vida operacional da campanha. Tabela determinística:
 * qualquer combinação fora dela é recusada (nunca "melhor esforço").
 * Nenhuma ação dispara chamada real: START apenas materializa jobs offline.
 */
export const CAMPAIGN_ACTIONS = ['START', 'PAUSE', 'RESUME', 'CANCEL'] as const;
export const campaignActionSchema = z.enum(CAMPAIGN_ACTIONS);
export type CampaignAction = z.infer<typeof campaignActionSchema>;

const TRANSITIONS: Readonly<
  Record<
    CampaignAction,
    { readonly from: ReadonlySet<OutboundCampaignStatus>; readonly to: OutboundCampaignStatus }
  >
> = {
  START: { from: new Set(['DRAFT']), to: 'ACTIVE' },
  PAUSE: { from: new Set(['ACTIVE']), to: 'PAUSED' },
  RESUME: { from: new Set(['PAUSED']), to: 'ACTIVE' },
  CANCEL: { from: new Set(['DRAFT', 'ACTIVE', 'PAUSED']), to: 'CANCELED' },
};

export type CampaignTransition =
  | { readonly ok: true; readonly to: OutboundCampaignStatus }
  | { readonly ok: false; readonly reason: 'INVALID_TRANSITION' };

export function resolveCampaignTransition(
  status: OutboundCampaignStatus,
  action: CampaignAction,
): CampaignTransition {
  const rule = TRANSITIONS[action];
  return rule.from.has(status)
    ? { ok: true, to: rule.to }
    : { ok: false, reason: 'INVALID_TRANSITION' };
}

/** Status de campanha que impedem o worker de reivindicar jobs (pausa/cancelamento efetivos). */
export const NON_DISPATCHABLE_CAMPAIGN_STATUSES: readonly OutboundCampaignStatus[] = [
  'PAUSED',
  'CANCELED',
  'COMPLETED',
];

export const assignCampaignAudienceInputSchema = z
  .object({
    contactListId: z.string().uuid(),
    /** Início agendado dos jobs materializados; ausente = imediatamente ao iniciar. */
    scheduledStartAt: z.string().datetime().optional(),
  })
  .strict();
export type AssignCampaignAudienceInput = z.infer<typeof assignCampaignAudienceInputSchema>;

export const campaignActionInputSchema = z.object({ action: campaignActionSchema }).strict();

/** Progresso REAL agregado dos jobs da campanha (sem dados simulados). */
export interface CampaignProgress {
  readonly total: number;
  readonly scheduled: number;
  readonly inProgress: number;
  readonly completed: number;
  readonly failed: number;
  readonly canceled: number;
}

export type CampaignActionOutcome =
  | {
      readonly kind: 'TRANSITIONED';
      readonly status: OutboundCampaignStatus;
      readonly jobsCreated: number;
      readonly jobsCanceled: number;
    }
  | {
      readonly kind: 'REJECTED';
      readonly reason:
        | 'NOT_FOUND'
        | 'INVALID_TRANSITION'
        | 'AUDIENCE_REQUIRED'
        | 'AGENT_VERSION_NOT_PUBLISHED'
        | 'AGENT_NOT_ACTIVE'
        | 'NO_ELIGIBLE_CONTACTS';
    };
