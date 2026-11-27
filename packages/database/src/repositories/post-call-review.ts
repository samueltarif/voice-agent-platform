import { and, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { postCallReconciliations } from '../schema/post-call-reconciliations.js';
import { decideIntent, lockPendingIntent } from './booking-intent-store.js';
import type { EffectsDeps } from './post-call-effects.js';
import { adoptOrphanSessions } from './post-call-orphans.js';
import { lockReconciliation, updateReconciliation } from './post-call-reconciliation-store.js';

/**
 * E2 simplificada (DEC-077) — relatório AUSENTE ou ATRASADO e decisão humana.
 * - `expireOverdue`: sessões sem relatório além do prazo (`REPORT_MISSING`)
 *   ou com relatório registrado cujo processamento não terminou
 *   (`REPORT_PROCESSING_INCOMPLETE`) vão para revisão; a intenção pendente
 *   também (nunca vira reunião). O telefone continua bloqueado até a decisão
 *   humana.
 *   M1: o prazo é REAVALIADO sob a trava (um relatório recebido entre a
 *   seleção e a trava não é marcado como interrompido).
 * - `resolveReview`: um usuário registra a decisão — só sobre uma
 *   reconciliação EM REVISÃO (M1: `AWAITING_REPORT` não pode ser liberada
 *   antes de existir revisão); só então o telefone é liberado. Não reserva
 *   nem desfaz nada (reserva manual = E1 `bookMeeting`).
 * - A5: sessões encerradas de agentes da E2 sem reconciliação (composição
 *   falhou em abri-la) são adotadas antes, para seguirem o mesmo prazo.
 */

export interface ReviewResolution {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly userId: string;
}

export type ReviewResolutionResult =
  'RESOLVED' | 'NOT_FOUND' | 'ALREADY_RECONCILED' | 'INTENT_PENDING' | 'NOT_IN_REVIEW';

type Row = NonNullable<Awaited<ReturnType<typeof lockReconciliation>>>;

/** M1: o mesmo critério da seleção, reaplicado à linha travada. */
function overdue(row: Row, cutoff: Date): boolean {
  if (row.status !== 'AWAITING_REPORT') return false;
  const since = row.reportDigest ? row.reportReceivedAt : row.createdAt;
  return since !== null && since < cutoff;
}

export async function expireOverdue(
  deps: EffectsDeps,
  input: { readonly olderThanMinutes: number },
): Promise<number> {
  const cutoff = new Date(deps.clock().getTime() - input.olderThanMinutes * 60_000);
  await adoptOrphanSessions(deps, cutoff);
  const due = await deps.db
    .select({
      organizationId: postCallReconciliations.organizationId,
      sessionId: postCallReconciliations.sessionId,
    })
    .from(postCallReconciliations)
    .where(
      and(
        eq(postCallReconciliations.status, 'AWAITING_REPORT'),
        or(
          and(
            isNull(postCallReconciliations.reportDigest),
            lt(postCallReconciliations.createdAt, cutoff),
          ),
          and(
            isNotNull(postCallReconciliations.reportDigest),
            lt(postCallReconciliations.reportReceivedAt, cutoff),
          ),
        ),
      ),
    );
  let expired = 0;
  for (const key of due) {
    const done = await deps.db.transaction(async (tx) => {
      const pending = await lockPendingIntent(tx, key);
      const row = await lockReconciliation(tx, key);
      if (!row || !overdue(row, cutoff)) return false;
      const reason = row.reportDigest ? 'REPORT_PROCESSING_INCOMPLETE' : 'REPORT_MISSING';
      const decision = { status: 'NEEDS_REVIEW' as const, reason, now: deps.clock() };
      if (pending) await decideIntent(tx, pending, decision);
      const reviewReasons = [...new Set([...row.reviewReasons, reason])];
      await updateReconciliation(tx, key, { status: 'NEEDS_REVIEW', reviewReasons });
      return true;
    });
    if (done) expired += 1;
  }
  return expired;
}

export function resolveReview(
  deps: EffectsDeps,
  input: ReviewResolution,
): Promise<ReviewResolutionResult> {
  const key = { organizationId: input.organizationId, sessionId: input.sessionId };
  return deps.db.transaction(async (tx) => {
    const pending = await lockPendingIntent(tx, key);
    const row = await lockReconciliation(tx, key);
    if (!row) return 'NOT_FOUND';
    if (row.status === 'RECONCILED') return 'ALREADY_RECONCILED';
    if (row.status !== 'NEEDS_REVIEW') return 'NOT_IN_REVIEW';
    if (pending) return 'INTENT_PENDING';
    await updateReconciliation(tx, key, {
      status: 'RECONCILED',
      reconciledAt: deps.clock(),
      reconciledBy: `user:${input.userId}`,
    });
    return 'RESOLVED';
  });
}
