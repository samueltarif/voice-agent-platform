import type { PendingBookingIntent, PostCallReport } from '@voice-agent/contracts';
import { pendingOf, reportDigest, sessionPhone } from './post-call-record-support.js';
import type { DatabaseInstance } from '../client/connection.js';
import type { BookingIntentEntity } from '../schema/booking-intents.js';
import { sessionIntents } from './booking-intent-store.js';
import type { DatabaseExecutor } from './database-executor.js';
import {
  ensureReconciliation,
  lockReconciliation,
  updateReconciliation,
  type ReconciliationKey,
} from './post-call-reconciliation-store.js';
import { leadIdForPhone } from './scheduling-agent-opt-out.js';

/**
 * E2 simplificada (DEC-077) — 1ª etapa do relatório pós-chamada (trava R):
 * valida a sessão da tentativa resolvida PELO SERVIDOR (nunca pelo
 * relatório), registra o digest — que também SELA a sessão para novas
 * operações comerciais (A6) — e só DEPOIS de R lê a intenção pendente e os
 * motivos de revisão já decididos (A4: o reprocessamento após falha parcial
 * não os perde). Mesmo digest com reconciliação concluída = duplicado;
 * digest diferente = conflito (revisão humana, sem efeito), com a identidade
 * guardada (M2: a reentrega de um conflito já decidido não reabre a revisão);
 * relatório que chega depois de uma decisão humana = revisão.
 */

export interface PostCallAttempt {
  readonly organizationId: string;
  readonly attemptId: string;
  readonly jobId: string;
  readonly callSessionId: string | null;
  readonly agentId: string;
  readonly agentVersionId: string;
}

export interface OptOutTarget {
  readonly sessionId: string;
  readonly phoneE164: string;
  readonly leadId: string | null;
}

export type RecordStep =
  | {
      readonly kind: 'STOP';
      readonly status: 'DUPLICATE' | 'REJECTED' | 'NEEDS_REVIEW';
      readonly reason: string;
      /** Sessão validada (paradas depois do registro): retenção da intenção e opt-out tardio. */
      readonly target?: OptOutTarget;
    }
  | {
      readonly kind: 'PROCESS';
      readonly organizationId: string;
      readonly sessionId: string;
      readonly phoneE164: string;
      readonly leadId: string | null;
      readonly digest: string;
      /** Motivos de revisão já persistidos nas intenções da sessão (A4). */
      readonly priorReviewReasons: readonly string[];
      readonly intent: BookingIntentEntity | null;
      readonly pending: PendingBookingIntent | null;
      readonly optOutByTool: boolean;
      readonly proposedOutcome: string | null;
    };

const stop = (status: 'DUPLICATE' | 'REJECTED' | 'NEEDS_REVIEW', reason: string): RecordStep => ({
  kind: 'STOP',
  status,
  reason,
});

type Reconciliation = NonNullable<Awaited<ReturnType<typeof lockReconciliation>>>;

type Verdict = 'PROCESS' | 'CONFLICT' | 'AFTER_RESOLUTION' | RecordStep;

/** Classificação pura da entrega diante da reconciliação travada. */
function verdictOf(row: Reconciliation, digest: string): Verdict {
  if (row.reportDigest === digest) {
    return row.status === 'AWAITING_REPORT' ? 'PROCESS' : stop('DUPLICATE', row.status);
  }
  if (row.conflictDigests.includes(digest)) {
    return row.status === 'NEEDS_REVIEW'
      ? stop('NEEDS_REVIEW', 'REPORT_CONFLICT')
      : stop('DUPLICATE', 'CONFLICT_ALREADY_DECIDED');
  }
  if (row.reportDigest) return 'CONFLICT';
  // Sem relatório anterior: pendente ou já em revisão (atrasado) segue; decidida por humano, não.
  return row.status === 'RECONCILED' ? 'AFTER_RESOLUTION' : 'PROCESS';
}

/** Conflito (M2: identidade guardada) ou relatório depois de decisão humana: revisão, sem efeito. */
async function settledStop(
  tx: DatabaseExecutor,
  ctx: { readonly row: Reconciliation; readonly digest: string; readonly key: ReconciliationKey },
): Promise<RecordStep | null> {
  const { row, digest, key } = ctx;
  const verdict = verdictOf(row, digest);
  if (verdict === 'PROCESS') return null;
  if (typeof verdict !== 'string') return verdict;
  const reason = verdict === 'CONFLICT' ? 'REPORT_CONFLICT' : 'REPORT_AFTER_RESOLUTION';
  await updateReconciliation(tx, key, {
    status: 'NEEDS_REVIEW',
    reviewReasons: [...new Set([...row.reviewReasons, reason])],
    conflictDigests:
      verdict === 'CONFLICT' ? [...row.conflictDigests, digest] : row.conflictDigests,
    reportDigest: row.reportDigest ?? digest,
    reconciledAt: null,
    reconciledBy: null,
  });
  return stop('NEEDS_REVIEW', reason);
}

export function recordReport(
  db: DatabaseInstance,
  input: { readonly attempt: PostCallAttempt; readonly report: PostCallReport; readonly now: Date },
): Promise<RecordStep> {
  const { attempt } = input;
  const sessionId = attempt.callSessionId;
  if (!sessionId) return Promise.resolve(stop('REJECTED', 'NO_SESSION'));
  return db.transaction(async (tx): Promise<RecordStep> => {
    const resolved = await sessionPhone(tx, attempt, sessionId);
    if (resolved.phone === null) return stop('REJECTED', resolved.reason);
    const phoneE164 = resolved.phone;
    const leadId = await leadIdForPhone(tx, { organizationId: attempt.organizationId, phoneE164 });
    const key = { organizationId: attempt.organizationId, sessionId };
    await ensureReconciliation(
      tx,
      { ...attempt, sessionId },
      { phoneE164, leadId, now: input.now },
    );
    const row = (await lockReconciliation(tx, key))!;
    if (row.attemptId !== attempt.attemptId) return stop('REJECTED', 'ATTEMPT_MISMATCH');
    const digest = reportDigest(input.report);
    const settled = await settledStop(tx, { row, digest, key });
    if (settled?.kind === 'STOP') return { ...settled, target: { sessionId, phoneE164, leadId } };
    await updateReconciliation(tx, key, {
      reportDigest: digest,
      reportReceivedAt: input.now,
      reportEndReason: input.report.endReason,
    });
    // Depois de R: ferramenta concorrente já gravou (visível) ou verá o selo e desistirá.
    const intents = await sessionIntents(tx, key);
    return {
      kind: 'PROCESS',
      organizationId: attempt.organizationId,
      sessionId,
      phoneE164,
      leadId,
      digest,
      priorReviewReasons: intents.reviewReasons,
      intent: intents.pending,
      pending: await pendingOf(tx, intents.pending),
      optOutByTool: row.optOutToolAt !== null,
      proposedOutcome: row.proposedOutcome,
    };
  });
}

export { reportDigest } from './post-call-record-support.js';
