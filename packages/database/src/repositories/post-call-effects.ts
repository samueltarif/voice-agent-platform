import type { PostCallEvaluation } from '@voice-agent/contracts';
import type { BookingIntentEntity } from '../schema/booking-intents.js';
import type { LeadEntity } from '../schema/leads.js';
import {
  closePendingIntent,
  decideIntent,
  intentReviewReason,
  lockIntent,
} from './booking-intent-store.js';
import type { DatabaseInstance } from '../client/connection.js';
import { lockLead } from './lead-status-writer.js';
import type { DrizzleMeetingBookingService } from './meeting-booking-service.js';
import { bookAcceptedIntent } from './post-call-booking.js';
import { lockCurrentReport } from './post-call-reconciliation-store.js';
import type { DatabaseExecutor } from './database-executor.js';
import type { OptOutTarget, PostCallAttempt, RecordStep } from './post-call-record.js';
import { recordCanonicalOptOut } from './scheduling-agent-opt-out.js';
import { lockProtocol } from './scheduling-protocol-store.js';

/**
 * E2 simplificada (DEC-077) — 2ª etapa: efeitos da avaliação do histórico,
 * cada um na sua transação e na ordem global de travas, todos idempotentes
 * (reprocessar a mesma entrega não duplica nada):
 * - opt-out pedido no histórico e não registrado: supressão canônica
 *   (`POST_CALL`), L → A → S → I → P;
 * - aceite comprovado: reserva transacional da E1 (`post-call-booking`);
 *   recusa: intenção `REJECTED`; dúvida: `NEEDS_REVIEW` (motivo persistido);
 * - resultado PROPOSTO (A7): `CONTACTED` com interlocução no histórico;
 *   `NOT_INTERESTED`/`QUALIFIED` exigem evidência que o histórico textual não
 *   dá ⇒ revisão; suspenso com possível opt-out ou histórico incompleto;
 *   timeout genérico nunca vira resultado.
 * A4: exceto o opt-out (preventivo), todo efeito confere, na própria
 * transação e depois de I/L, que este relatório ainda é o vigente em R.
 * Devolve os motivos de revisão humana.
 */

export type Processing = Extract<RecordStep, { kind: 'PROCESS' }>;

export interface EffectsDeps {
  readonly db: DatabaseInstance;
  readonly bookings: DrizzleMeetingBookingService;
  readonly clock: () => Date;
}

export interface EffectInput {
  readonly attempt: PostCallAttempt;
  readonly step: Processing;
  readonly evaluation: PostCallEvaluation;
}

const lockOptionalLead = (tx: Parameters<typeof lockLead>[0], step: OptOutTarget, org: string) =>
  step.leadId ? lockLead(tx, org, step.leadId) : Promise.resolve(null as LeadEntity | null);

export async function applyPostCallOptOut(
  deps: EffectsDeps,
  input: { readonly attempt: PostCallAttempt; readonly step: OptOutTarget },
): Promise<void> {
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

const keyOf = (step: Processing) => ({
  organizationId: step.organizationId,
  sessionId: step.sessionId,
});

export const reportCurrent = (tx: DatabaseExecutor, step: Processing) =>
  lockCurrentReport(tx, keyOf(step), step.digest).then((row) => row !== null);

/** Decide a intenção (I → R) só se o relatório ainda for o vigente. */
async function decideOnly(
  deps: EffectsDeps,
  input: { readonly step: Processing; readonly intent: BookingIntentEntity },
  decision: { readonly status: 'REJECTED' | 'NEEDS_REVIEW'; readonly reason: string },
) {
  const { step, intent } = input;
  const key = { organizationId: intent.organizationId, intentId: intent.id };
  await deps.db.transaction(async (tx) => {
    await lockIntent(tx, key);
    if (await reportCurrent(tx, step)) {
      await decideIntent(tx, intent, { ...decision, now: deps.clock() });
    }
  });
}

/** Devolve o motivo de revisão, se houver. */
export async function applyPostCallBooking(
  deps: EffectsDeps,
  input: EffectInput,
): Promise<string | null> {
  const { step } = input;
  const intent = step.intent;
  const { decision, reason } = input.evaluation.booking;
  if (!intent || decision === 'NONE') return null;
  if (decision === 'REJECTED') {
    await decideOnly(deps, { step, intent }, { status: 'REJECTED', reason });
    return null;
  }
  if (decision === 'REVIEW') {
    await decideOnly(deps, { step, intent }, { status: 'NEEDS_REVIEW', reason });
    return intentReviewReason(reason);
  }
  const result = await bookAcceptedIntent(deps.bookings, {
    intent,
    agentId: input.attempt.agentId,
    now: deps.clock,
    reportCurrent: (tx) => reportCurrent(tx, step),
  });
  if (result.kind === 'NOT_CURRENT') return 'REPORT_NOT_CURRENT';
  if (result.kind !== 'REFUSED') return null;
  await decideOnly(deps, { step, intent }, { status: 'NEEDS_REVIEW', reason: result.reason });
  return intentReviewReason(result.reason);
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
