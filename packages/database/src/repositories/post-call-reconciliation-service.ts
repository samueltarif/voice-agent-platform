import { evaluatePostCallReport, type PostCallReport } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { DrizzleMeetingBookingService } from './meeting-booking-service.js';
import {
  applyPostCallBooking,
  applyPostCallOptOut,
  applyPostCallOutcome,
  optOutReviewReasons,
  type EffectsDeps,
  type Processing,
} from './post-call-effects.js';
import { recordReport, type PostCallAttempt } from './post-call-record.js';
import { lockReconciliation, updateReconciliation } from './post-call-reconciliation-store.js';
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
    if (step.kind === 'STOP') return { status: step.status, reasons: [step.reason] };
    const evaluation = evaluatePostCallReport(report, step.pending);
    const input = { attempt, step, evaluation };
    const reasons = optOutReviewReasons(step, evaluation);
    if (evaluation.optOut === 'REQUESTED') await applyPostCallOptOut(this.deps, input);
    const booking = await applyPostCallBooking(this.deps, input);
    if (booking) reasons.push(booking);
    const outcome = await applyPostCallOutcome(this.deps, input);
    return this.close(step, { reasons, outcome });
  }

  private close(
    step: Processing,
    input: { readonly reasons: readonly string[]; readonly outcome: string | null },
  ): Promise<PostCallIngestResult> {
    const key = { organizationId: step.organizationId, sessionId: step.sessionId };
    return this.deps.db.transaction(async (tx) => {
      const row = (await lockReconciliation(tx, key))!;
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
