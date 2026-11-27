import { evaluatePostCallReport, type PostCallReport } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { closePendingIntent } from './booking-intent-store.js';
import { DrizzleMeetingBookingService } from './meeting-booking-service.js';
import {
  applyPostCallBooking,
  applyPostCallOptOut,
  optOutReviewReasons,
  type EffectsDeps,
  type Processing,
} from './post-call-effects.js';
import { applyPostCallOutcome } from './post-call-outcome.js';
import { recordReport, type PostCallAttempt, type RecordStep } from './post-call-record.js';
import {
  lockCurrentReport,
  lockReconciliation,
  updateReconciliation,
} from './post-call-reconciliation-store.js';
import { expireOverdue, resolveReview, type ReviewResolution } from './post-call-review.js';

/**
 * E2 simplificada (DEC-077) — reconciliação PÓS-CHAMADA (serviço canônico,
 * OFFLINE: nenhuma rota pública é montada). Recebe o relatório já
 * AUTENTICADO e NORMALIZADO, com a tentativa resolvida pelo servidor.
 * Etapas: registro idempotente (R) → avaliação pura do histórico → efeitos
 * (opt-out, reserva da intenção aceita, resultado proposto) → fechamento
 * (`RECONCILED` sem pendências; senão `NEEDS_REVIEW`). Enquanto não fechar,
 * o claim de envio recusa novas tentativas para o telefone.
 */

const LATE_OPT_OUT = new Set(['REPORT_CONFLICT', 'REPORT_AFTER_RESOLUTION']);

export type PostCallIngestResult =
  | { readonly status: 'RECONCILED' | 'NEEDS_REVIEW'; readonly reasons: readonly string[] }
  | { readonly status: 'DUPLICATE' | 'REJECTED'; readonly reasons: readonly string[] };

export class DrizzlePostCallReconciliationService {
  private readonly deps: EffectsDeps;

  constructor(db: DatabaseInstance, options: { readonly clock?: () => Date } = {}) {
    const clock = options.clock ?? (() => new Date());
    this.deps = { db, clock, bookings: new DrizzleMeetingBookingService(db, clock) };
  }

  async ingest(attempt: PostCallAttempt, report: PostCallReport): Promise<PostCallIngestResult> {
    const step = await recordReport(this.deps.db, { attempt, report, now: this.deps.clock() });
    if (step.kind === 'STOP') {
      await this.afterStop(attempt, report, step);
      return { status: step.status, reasons: [step.reason] };
    }
    const evaluation = evaluatePostCallReport(report, step.pending);
    const input = { attempt, step, evaluation };
    const reasons = [...step.priorReviewReasons, ...optOutReviewReasons(step, evaluation)];
    if (!evaluation.complete) reasons.push('HISTORY_INCOMPLETE');
    if (evaluation.optOut === 'REQUESTED') await applyPostCallOptOut(this.deps, input);
    const booking = await applyPostCallBooking(this.deps, input);
    if (booking) reasons.push(booking);
    const outcome = await applyPostCallOutcome(this.deps, input);
    if (outcome.review) reasons.push(outcome.review);
    return this.close(step, { reasons, outcome: outcome.applied });
  }

  /**
   * Paradas depois do registro (conflito, relatório após decisão humana,
   * reentrega de algo já em revisão):
   * - reauditoria A4: a intenção ainda pendente é retida para revisão em TODA
   *   parada com a reconciliação em revisão — uma queda entre o registro do
   *   conflito e a retenção se recupera em qualquer reentrega (e, sem
   *   reentrega, na decisão humana: `resolveReview`);
   * - reauditoria (relatório tardio): decisões anteriores são preservadas,
   *   mas um opt-out EXPLÍCITO de fala íntegra é aplicado (idempotente).
   */
  private async afterStop(
    attempt: PostCallAttempt,
    report: PostCallReport,
    step: Extract<RecordStep, { kind: 'STOP' }>,
  ): Promise<void> {
    if (!step.target) return;
    const inReview =
      step.status === 'NEEDS_REVIEW' ||
      (step.status === 'DUPLICATE' && step.reason === 'NEEDS_REVIEW');
    if (inReview) {
      const reason = step.status === 'NEEDS_REVIEW' ? step.reason : 'REVIEW_PENDING';
      await this.holdPendingIntent(attempt, reason);
    }
    if (!LATE_OPT_OUT.has(step.reason)) return;
    if (evaluatePostCallReport(report, null).optOut !== 'REQUESTED') return;
    await applyPostCallOptOut(this.deps, { attempt, step: step.target });
  }

  /**
   * A4: conflito (ou relatório após decisão humana) — a intenção pendente sai
   * de `PENDING_EVIDENCE` para revisão numa transação própria (I), na ordem
   * global: uma reserva concorrente ou já viu o conflito em R e desistiu, ou
   * reservou antes dele (reunião confirmada continua com a revisão humana).
   */
  private holdPendingIntent(attempt: PostCallAttempt, reason: string): Promise<void> {
    const key = { organizationId: attempt.organizationId, sessionId: attempt.callSessionId! };
    const decision = { status: 'NEEDS_REVIEW' as const, reason, now: this.deps.clock() };
    return this.deps.db.transaction((tx) => closePendingIntent(tx, key, decision));
  }

  private close(
    step: Processing,
    input: { readonly reasons: readonly string[]; readonly outcome: string | null },
  ): Promise<PostCallIngestResult> {
    const key = { organizationId: step.organizationId, sessionId: step.sessionId };
    return this.deps.db.transaction(async (tx) => {
      const row = await lockCurrentReport(tx, key, step.digest);
      if (!row) {
        // A4: outro relatório (conflito) ou uma decisão humana prevaleceu: nada a fechar.
        const now = (await lockReconciliation(tx, key))!;
        return {
          status: now.status === 'RECONCILED' ? 'RECONCILED' : 'NEEDS_REVIEW',
          reasons: now.reviewReasons,
        };
      }
      const reasons = [...new Set([...row.reviewReasons, ...input.reasons])];
      const status = reasons.length > 0 ? 'NEEDS_REVIEW' : 'RECONCILED';
      await updateReconciliation(tx, key, {
        status,
        reviewReasons: reasons,
        outcomeApplied: input.outcome ?? row.outcomeApplied,
        reconciledAt: status === 'RECONCILED' ? this.deps.clock() : null,
        reconciledBy: status === 'RECONCILED' ? 'system:post-call' : null,
      });
      return { status, reasons };
    });
  }

  /** Relatório ausente/atrasado além do prazo: revisão humana (o telefone continua bloqueado). */
  expireOverdue(input: { readonly olderThanMinutes: number }): Promise<number> {
    return expireOverdue(this.deps, input);
  }

  /** Decisão humana registrada: libera o telefone (não reserva nem desfaz nada). */
  resolveReview(input: ReviewResolution): ReturnType<typeof resolveReview> {
    return resolveReview(this.deps, input);
  }
}
