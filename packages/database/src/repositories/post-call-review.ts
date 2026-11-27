import { and, eq, isNull, lt } from 'drizzle-orm';
import { postCallReconciliations } from '../schema/post-call-reconciliations.js';
import { decideIntent, lockPendingIntent } from './booking-intent-store.js';
import type { EffectsDeps } from './post-call-effects.js';
import { lockReconciliation, updateReconciliation } from './post-call-reconciliation-store.js';

/**
 * E2 simplificada (DEC-077) — relatório AUSENTE ou ATRASADO e decisão humana.
 * - `expireOverdue`: sessões sem relatório além do prazo vão para revisão
 *   (`REPORT_MISSING`); a intenção pendente também (nunca vira reunião). O
 *   telefone continua bloqueado até a decisão humana.
 * - `resolveReview`: um usuário registra a decisão; só então o telefone é
 *   liberado. Não reserva nem desfaz nada (reserva manual = E1 `bookMeeting`).
 */

export interface ReviewResolution {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly userId: string;
}

export type ReviewResolutionResult =
  'RESOLVED' | 'NOT_FOUND' | 'ALREADY_RECONCILED' | 'INTENT_PENDING';

export async function expireOverdue(
  deps: EffectsDeps,
  input: { readonly olderThanMinutes: number },
): Promise<number> {
  const cutoff = new Date(deps.clock().getTime() - input.olderThanMinutes * 60_000);
  const due = await deps.db
    .select({
      organizationId: postCallReconciliations.organizationId,
      sessionId: postCallReconciliations.sessionId,
    })
    .from(postCallReconciliations)
    .where(
      and(
        eq(postCallReconciliations.status, 'AWAITING_REPORT'),
        isNull(postCallReconciliations.reportDigest),
        lt(postCallReconciliations.createdAt, cutoff),
      ),
    );
  let expired = 0;
  for (const key of due) {
    const done = await deps.db.transaction(async (tx) => {
      const pending = await lockPendingIntent(tx, key);
      const row = await lockReconciliation(tx, key);
      if (!row || row.status !== 'AWAITING_REPORT' || row.reportDigest) return false;
      const decision = {
        status: 'NEEDS_REVIEW' as const,
        reason: 'REPORT_MISSING',
        now: deps.clock(),
      };
      if (pending) await decideIntent(tx, pending, decision);
      const reviewReasons = [...new Set([...row.reviewReasons, 'REPORT_MISSING'])];
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
    if (pending) return 'INTENT_PENDING';
    await updateReconciliation(tx, key, {
      status: 'RECONCILED',
      reconciledAt: deps.clock(),
      reconciledBy: `user:${input.userId}`,
    });
    return 'RESOLVED';
  });
}
