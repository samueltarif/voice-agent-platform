import { and, eq } from 'drizzle-orm';
import type {
  ReleaseOutboundBudgetInput,
  ReleaseOutboundBudgetOutcome,
} from '@voice-agent/contracts';
import { outboundBudgetLedgers } from '../schema/outbound-budget-ledgers.js';
import {
  outboundBudgetReservations,
  type OutboundBudgetReservationEntity,
} from '../schema/outbound-budget-reservations.js';
import type { DatabaseExecutor } from './database-executor.js';
import { mapOutboundBudgetReservation } from './outbound-budget-mapping.js';

function checkReleaseEligibility(
  reservation: OutboundBudgetReservationEntity | undefined,
): ReleaseOutboundBudgetOutcome | null {
  if (!reservation) {
    return {
      kind: 'RESERVATION_NOT_FOUND',
      reason: 'Reservation not found for organization and attempt.',
    };
  }
  if (reservation.status === 'RELEASED') {
    return {
      kind: 'ALREADY_RELEASED',
      reservation: mapOutboundBudgetReservation(reservation),
    };
  }
  if (reservation.status === 'COMMITTED') {
    return {
      kind: 'ALREADY_SETTLED',
      reservation: mapOutboundBudgetReservation(reservation),
      reason: 'Cannot release a reservation that was already settled.',
    };
  }
  return null;
}

async function unencumberLedger(
  tx: DatabaseExecutor,
  orgId: string,
  amount: number,
): Promise<void> {
  const [ledger] = await tx
    .select()
    .from(outboundBudgetLedgers)
    .where(eq(outboundBudgetLedgers.organizationId, orgId))
    .for('update');

  if (ledger) {
    await tx
      .update(outboundBudgetLedgers)
      .set({
        reservedAmountMinorUnits: Math.max(0, ledger.reservedAmountMinorUnits - amount),
        version: ledger.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(outboundBudgetLedgers.id, ledger.id));
  }
}

export async function releaseBudgetInTransaction(
  tx: DatabaseExecutor,
  input: ReleaseOutboundBudgetInput,
): Promise<ReleaseOutboundBudgetOutcome> {
  const [reservation] = await tx
    .select()
    .from(outboundBudgetReservations)
    .where(
      and(
        eq(outboundBudgetReservations.organizationId, input.organizationId),
        eq(outboundBudgetReservations.attemptId, input.attemptId),
      ),
    )
    .for('update');

  const ineligibility = checkReleaseEligibility(reservation);
  if (ineligibility) return ineligibility;

  await unencumberLedger(tx, input.organizationId, reservation!.reservedAmountMinorUnits);

  const [updated] = await tx
    .update(outboundBudgetReservations)
    .set({
      status: 'RELEASED',
      releaseReason: input.reason,
      releasedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(outboundBudgetReservations.id, reservation!.id))
    .returning();

  if (!updated) {
    throw new Error('Failed to update released outbound budget reservation');
  }

  return {
    kind: 'RELEASED',
    reservation: mapOutboundBudgetReservation(updated),
    releasedAmountMinorUnits: reservation!.reservedAmountMinorUnits,
  };
}
