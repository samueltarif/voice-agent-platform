import { z } from 'zod';
import type { CampaignProgress } from './campaign-lifecycle.js';
import {
  attemptOutcomeClassSchema,
  type CampaignAttemptRow,
  type CampaignAttemptSummary,
  type CampaignCostSummary,
} from './campaign-report.js';
import type { OutboundCampaignStatus } from './outbound-contracts.js';

/**
 * 008-MVP4c — visão operacional da organização a partir do estado persistido
 * (substitui os dados simulados do dashboard e da tela de chamadas).
 */
export const OPERATIONS_MAX_PERIOD_DAYS = 90;

const periodDays = z.coerce.number().int().min(1).max(OPERATIONS_MAX_PERIOD_DAYS).default(7);

export const operationsOverviewQuerySchema = z.object({ days: periodDays }).strict();
export type OperationsOverviewQuery = z.infer<typeof operationsOverviewQuerySchema>;

export const listOperationsAttemptsQuerySchema = z
  .object({
    days: periodDays,
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    outcome: attemptOutcomeClassSchema.optional(),
  })
  .strict();
export type ListOperationsAttemptsQuery = z.infer<typeof listOperationsAttemptsQuerySchema>;

export interface OperationsCampaignItem {
  readonly campaignId: string;
  readonly name: string;
  readonly status: OutboundCampaignStatus;
  readonly progress: CampaignProgress;
}

export interface OperationsOverview {
  readonly periodDays: number;
  /** Início da janela (ISO) usada para tentativas e custos liquidados. */
  readonly since: string;
  readonly campaigns: {
    readonly byStatus: Readonly<Record<OutboundCampaignStatus, number>>;
    /** Campanhas ativas/pausadas mais recentes (no máximo 5), com progresso real. */
    readonly running: readonly OperationsCampaignItem[];
  };
  /** Tentativas criadas na janela, por classe de desfecho persistida. */
  readonly attempts: CampaignAttemptSummary;
  /** Sessões de chamada em andamento agora (CONNECTING/ACTIVE/ENDING). */
  readonly liveSessions: number;
  /**
   * `null` quando o papel não pode ver custos. `settled` = liquidado na janela;
   * `reservedOpen` = estimativa ainda reservada agora (independe da janela).
   */
  readonly costs: CampaignCostSummary | null;
  /** Transbordo humano ainda não é persistido: nada é inferido. */
  readonly handoffs: { readonly available: false; readonly reason: 'NOT_PERSISTED' };
  readonly dispositions: {
    readonly available: false;
    readonly reason: 'PROVIDER_INTEGRATION_PENDING';
  };
}

/** Tentativa da organização com a campanha de origem (quando houver). */
export interface OperationsAttemptRow extends CampaignAttemptRow {
  readonly campaignId: string | null;
  readonly campaignName: string | null;
}
