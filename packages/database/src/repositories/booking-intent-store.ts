import { and, eq, sql } from 'drizzle-orm';
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
