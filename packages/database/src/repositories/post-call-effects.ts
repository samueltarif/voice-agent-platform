import type { PostCallEvaluation } from '@voice-agent/contracts';
import type { BookingIntentEntity } from '../schema/booking-intents.js';
import type { LeadEntity } from '../schema/leads.js';
import { closePendingIntent, decideIntent } from './booking-intent-store.js';
import type { DatabaseInstance } from '../client/connection.js';
import { applyLeadStatusChange, lockLead } from './lead-status-writer.js';
import type { DrizzleMeetingBookingService } from './meeting-booking-service.js';
import { bookAcceptedIntent } from './post-call-booking.js';
import type { PostCallAttempt, RecordStep } from './post-call-record.js';
import { recordCanonicalOptOut } from './scheduling-agent-opt-out.js';
import { lockProtocol } from './scheduling-protocol-store.js';

/**
 * E2 simplificada (DEC-077) — 2ª etapa: efeitos da avaliação do histórico,
 * cada um na sua transação e na ordem global de travas, todos idempotentes
 * (reprocessar a mesma entrega não duplica nada):
 * - opt-out pedido no histórico e não registrado: supressão canônica
 *   (`POST_CALL`), L → A → S → I → P;
 * - aceite comprovado: reserva transacional da E1 (`post-call-booking`);
 *   recusa: intenção `REJECTED`; dúvida: `NEEDS_REVIEW`;
 * - resultado PROPOSTO: aplicado (matriz D5) só com interlocução no histórico
 *   e sem opt-out; timeout genérico nunca vira resultado.
 * Devolve os motivos de revisão humana.
 */

export type Processing = Extract<RecordStep, { kind: 'PROCESS' }>;

export interface EffectsDeps {
  readonly db: DatabaseInstance;
  readonly bookings: DrizzleMeetingBookingService;
  readonly clock: () => Date;
}

interface EffectInput {
  readonly attempt: PostCallAttempt;
  readonly step: Processing;
  readonly evaluation: PostCallEvaluation;
}

const lockOptionalLead = (tx: Parameters<typeof lockLead>[0], step: Processing, org: string) =>
  step.leadId ? lockLead(tx, org, step.leadId) : Promise.resolve(null as LeadEntity | null);

export async function applyPostCallOptOut(deps: EffectsDeps, input: EffectInput): Promise<void> {
  const { attempt, step } = input;
  const organizationId = attempt.organizationId;
  await deps.db.transaction(async (tx) => {
    const lead = await lockOptionalLead(tx, step, organizationId);
    const binding = { ...attempt, sessionId: step.sessionId };
    const locked = await lockProtocol(tx, binding);
    const now = deps.clock();
    const key = { organizationId, sessionId: step.sessionId };
    await closePendingIntent(tx, key, { status: 'CANCELED', reason: 'OPT_OUT', now });
    await recordCanonicalOptOut(tx, locked, {
      lead,
      organizationId,
      sessionId: step.sessionId,
      phoneE164: step.phoneE164,
      actor: { type: 'SYSTEM', id: 'post-call-reconciliation' },
      source: 'POST_CALL',
      now,
    });
  });
}

async function decideOnly(
  deps: EffectsDeps,
  intent: BookingIntentEntity,
  decision: { readonly status: 'REJECTED' | 'NEEDS_REVIEW'; readonly reason: string },
) {
  await deps.db.transaction((tx) => decideIntent(tx, intent, { ...decision, now: deps.clock() }));
}

/** Devolve o motivo de revisão, se houver. */
export async function applyPostCallBooking(
  deps: EffectsDeps,
  input: EffectInput,
): Promise<string | null> {
  const intent = input.step.intent;
  const { decision, reason } = input.evaluation.booking;
  if (!intent || decision === 'NONE') return null;
  if (decision === 'REJECTED') {
    await decideOnly(deps, intent, { status: 'REJECTED', reason });
    return null;
  }
  if (decision === 'REVIEW') {
    await decideOnly(deps, intent, { status: 'NEEDS_REVIEW', reason });
    return `BOOKING_${reason}`;
  }
  const result = await bookAcceptedIntent(deps.bookings, {
    intent,
    agentId: input.attempt.agentId,
    now: deps.clock,
  });
  if (result.kind !== 'REFUSED') return null;
  await decideOnly(deps, intent, { status: 'NEEDS_REVIEW', reason: result.reason });
  return result.reason;
}

/** Devolve o resultado efetivamente aplicado (ou `null`). */
export async function applyPostCallOutcome(
  deps: EffectsDeps,
  input: EffectInput,
): Promise<string | null> {
  const { step, evaluation, attempt } = input;
  const proposed = step.proposedOutcome;
  const optedOut = step.optOutByTool || evaluation.optOut === 'REQUESTED';
  if (!proposed || !step.leadId || !evaluation.interlocution || optedOut) return null;
  return deps.db.transaction(async (tx) => {
    const lead = await lockLead(tx, attempt.organizationId, step.leadId!);
    if (!lead) return null;
    const changed = await applyLeadStatusChange(tx, {
      lead,
      to: proposed as 'CONTACTED' | 'QUALIFIED' | 'NOT_INTERESTED',
      origin: 'CALL_OUTCOME',
      actor: { type: 'AGENT', id: attempt.agentId },
    });
    const applied = changed.kind === 'CHANGED' || changed.reason === 'SAME_STATUS';
    return applied ? proposed : null;
  });
}

/** Motivos de revisão derivados só da evidência de opt-out (sem efeito). */
export function optOutReviewReasons(step: Processing, evaluation: PostCallEvaluation): string[] {
  const reasons: string[] = [];
  if (step.intent && !step.pending) reasons.push('BOOKING_OFFER_UNRESOLVED');
  if (evaluation.optOut === 'MENTIONED') reasons.push('OPT_OUT_MENTION_UNCLEAR');
  if (step.optOutByTool && evaluation.optOut === 'NONE')
    reasons.push('OPT_OUT_TOOL_WITHOUT_EVIDENCE');
  return reasons;
}
