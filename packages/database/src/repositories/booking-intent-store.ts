import { and, eq, isNotNull, sql } from 'drizzle-orm';
import {
  bookingIntents,
  type BookingIntentEntity,
  type BookingIntentStatus,
} from '../schema/booking-intents.js';
import type { DatabaseExecutor } from './database-executor.js';
import type { ReconciliationKey } from './post-call-reconciliation-store.js';

/**
 * E2 simplificada (DEC-077) — intenções de agendamento (trava I, entre S e R).
 * Só a intenção `PENDING_EVIDENCE` pode virar reunião, e só pela
 * reconciliação pós-chamada.
 */

const pendingOf = (key: ReconciliationKey) =>
  and(
    eq(bookingIntents.organizationId, key.organizationId),
    eq(bookingIntents.sessionId, key.sessionId),
    eq(bookingIntents.status, 'PENDING_EVIDENCE'),
  );

export async function lockPendingIntent(
  tx: DatabaseExecutor,
  key: ReconciliationKey,
): Promise<BookingIntentEntity | null> {
  const [row] = await tx.select().from(bookingIntents).where(pendingOf(key)).for('update');
  return row ?? null;
}

/** Leitura SEM trava (depois de R): a intenção pendente e os motivos já decididos para revisão. */
export async function sessionIntents(
  executor: DatabaseExecutor,
  key: ReconciliationKey,
): Promise<{
  readonly pending: BookingIntentEntity | null;
  readonly reviewReasons: string[];
}> {
  const rows = await executor
    .select()
    .from(bookingIntents)
    .where(
      and(
        eq(bookingIntents.organizationId, key.organizationId),
        eq(bookingIntents.sessionId, key.sessionId),
      ),
    );
  const pending = rows.find((row) => row.status === 'PENDING_EVIDENCE') ?? null;
  const reviewReasons = rows
    .filter((row) => row.status === 'NEEDS_REVIEW')
    .map((row) => intentReviewReason(row.decisionReason ?? 'UNSPECIFIED'));
  return { pending, reviewReasons };
}

/** A4 — o motivo persistido na intenção é o mesmo motivo de revisão da reconciliação. */
export const intentReviewReason = (reason: string) =>
  reason.startsWith('BOOKING_') ? reason : `BOOKING_${reason}`;

/** A2 — a sessão já teve um pedido para esta lista e opção (ex.: substituído)? */
export async function hasEarlierRequest(
  executor: DatabaseExecutor,
  key: ReconciliationKey,
  choice: { readonly listRevision: number; readonly option: number },
): Promise<boolean> {
  const [row] = await executor
    .select({ id: bookingIntents.id })
    .from(bookingIntents)
    .where(
      and(
        eq(bookingIntents.organizationId, key.organizationId),
        eq(bookingIntents.sessionId, key.sessionId),
        eq(bookingIntents.listRevision, choice.listRevision),
        eq(bookingIntents.option, choice.option),
        isNotNull(bookingIntents.decidedAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export async function lockIntent(
  tx: DatabaseExecutor,
  key: { readonly organizationId: string; readonly intentId: string },
): Promise<BookingIntentEntity | null> {
  const [row] = await tx
    .select()
    .from(bookingIntents)
    .where(
      and(
        eq(bookingIntents.organizationId, key.organizationId),
        eq(bookingIntents.id, key.intentId),
      ),
    )
    .for('update');
  return row ?? null;
}

export interface IntentDecision {
  readonly status: Exclude<BookingIntentStatus, 'PENDING_EVIDENCE'>;
  readonly reason: string;
  readonly meetingId?: string | null;
  readonly now: Date;
}

/** Só decide uma intenção AINDA pendente; devolve se decidiu. */
export async function decideIntent(
  tx: DatabaseExecutor,
  intent: Pick<BookingIntentEntity, 'id' | 'organizationId'>,
  decision: IntentDecision,
): Promise<boolean> {
  const rows = await tx
    .update(bookingIntents)
    .set({
      status: decision.status,
      decisionReason: decision.reason,
      meetingId: decision.meetingId ?? null,
      decidedAt: decision.now,
      version: sql`${bookingIntents.version} + 1`,
    })
    .where(
      and(
        eq(bookingIntents.organizationId, intent.organizationId),
        eq(bookingIntents.id, intent.id),
        eq(bookingIntents.status, 'PENDING_EVIDENCE'),
      ),
    )
    .returning({ id: bookingIntents.id });
  return rows.length === 1;
}

/** Opt-out ou novo pedido: a intenção pendente da sessão deixa de valer. */
export async function closePendingIntent(
  tx: DatabaseExecutor,
  key: ReconciliationKey,
  decision: IntentDecision,
): Promise<void> {
  const pending = await lockPendingIntent(tx, key);
  if (pending) await decideIntent(tx, pending, decision);
}
