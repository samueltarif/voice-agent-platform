import { z } from 'zod';
import type { OutboundAttemptState } from '../telephony/outbound-attempt-state.js';
import type { CampaignProgress } from './campaign-lifecycle.js';
import type { OutboundCampaignStatus } from './outbound-contracts.js';

/**
 * 008-MVP4 — classes de desfecho de TENTATIVA derivadas apenas do estado
 * persistido (FSM da 008-OF1) e do status da campanha. Nenhuma classe afirma
 * algo que o estado não prova: "enviada" exige `sendStartedAt` gravado;
 * desfecho desconhecido nunca vira sucesso ou falha.
 */
export const ATTEMPT_OUTCOME_CLASSES = [
  'NOT_SENT_PENDING',
  'HELD_BY_PAUSE',
  'IN_FLIGHT',
  'OUTCOME_UNKNOWN',
  'NO_CALL_CREATED',
  'CANCELED_BEFORE_SEND',
  'ENDED',
] as const;
export const attemptOutcomeClassSchema = z.enum(ATTEMPT_OUTCOME_CLASSES);
export type AttemptOutcomeClass = z.infer<typeof attemptOutcomeClassSchema>;

const BY_STATE: Readonly<Record<OutboundAttemptState, AttemptOutcomeClass>> = {
  CREATED: 'NOT_SENT_PENDING',
  ORIGINATION_PENDING: 'NOT_SENT_PENDING',
  ORIGINATION_SENT: 'IN_FLIGHT',
  ORIGINATION_ACCEPTED: 'IN_FLIGHT',
  OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN',
  RECONCILIATION_PENDING: 'OUTCOME_UNKNOWN',
  ORIGINATION_REJECTED: 'NO_CALL_CREATED',
  NOT_ORIGINATED: 'NO_CALL_CREATED',
  CLOSED: 'ENDED',
  CANCELED: 'CANCELED_BEFORE_SEND',
};

/** Tentativa ainda não enviada de campanha pausada fica retida (008-MVP2, #129). */
export function classifyAttemptOutcome(
  state: OutboundAttemptState,
  campaignStatus: OutboundCampaignStatus,
): AttemptOutcomeClass {
  const base = BY_STATE[state];
  return base === 'NOT_SENT_PENDING' && campaignStatus === 'PAUSED' ? 'HELD_BY_PAUSE' : base;
}

/** Estados persistidos que compõem cada classe (filtro de listagem no banco). */
export function attemptStatesForOutcome(outcome: AttemptOutcomeClass): OutboundAttemptState[] {
  const target = outcome === 'HELD_BY_PAUSE' ? 'NOT_SENT_PENDING' : outcome;
  return (Object.keys(BY_STATE) as OutboundAttemptState[]).filter((s) => BY_STATE[s] === target);
}

/**
 * Minimização de PII nos relatórios: mantém os 4 últimos dígitos (e, no Brasil,
 * o DDD). Entrada fora de E.164 nunca é exibida.
 */
export function maskPhoneE164(phone: string): string {
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return '•••';
  const last4 = phone.slice(-4);
  if (!phone.startsWith('+55')) return `+${'•'.repeat(phone.length - 5)}-${last4}`;
  return `+55 ${phone.slice(3, 5)} ${'•'.repeat(phone.length - 9)}-${last4}`;
}

export type AttemptOutcomeCounts = Readonly<Record<AttemptOutcomeClass, number>>;

export interface CampaignAttemptSummary {
  readonly total: number;
  /** Tentativas com envio iniciado (`sendStartedAt` gravado). */
  readonly sent: number;
  readonly requiresManualReview: number;
  readonly byOutcome: AttemptOutcomeCounts;
}

export interface MinorUnitsBreakdown {
  readonly carrier: number;
  readonly conversational: number;
  readonly total: number;
}

/**
 * Custos SOMENTE do ledger: `settled` = liquidado (custo real registrado);
 * `reservedOpen` = estimativa ainda reservada (não é custo incorrido).
 */
export interface CampaignCostSummary {
  readonly currency: string | null;
  readonly settled: MinorUnitsBreakdown;
  readonly settledAttempts: number;
  readonly reservedOpen: MinorUnitsBreakdown;
  readonly openReservations: number;
}

export interface CampaignReport {
  readonly campaignId: string;
  readonly campaignStatus: OutboundCampaignStatus;
  readonly progress: CampaignProgress;
  readonly attempts: CampaignAttemptSummary;
  /** `null` quando o papel não pode ver custos. */
  readonly costs: CampaignCostSummary | null;
  /** Classificação de desfecho conversacional depende da integração do provedor (008-OF5). */
  readonly dispositions: {
    readonly available: false;
    readonly reason: 'PROVIDER_INTEGRATION_PENDING';
  };
}

export interface CampaignAttemptRow {
  readonly attemptId: string;
  readonly jobId: string;
  readonly attemptNumber: number;
  readonly destinationMasked: string;
  readonly state: OutboundAttemptState;
  readonly outcome: AttemptOutcomeClass;
  readonly sent: boolean;
  readonly requiresManualReview: boolean;
  readonly createdAt: string;
  readonly sendStartedAt: string | null;
  readonly lastEventAt: string | null;
  /** Duração somente quando a sessão registrou início E fim. */
  readonly callDurationSeconds: number | null;
}

export const listCampaignAttemptsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    outcome: attemptOutcomeClassSchema.optional(),
  })
  .strict();
export type ListCampaignAttemptsQuery = z.infer<typeof listCampaignAttemptsQuerySchema>;
