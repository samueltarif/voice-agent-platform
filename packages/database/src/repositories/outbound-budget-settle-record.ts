import { eq } from 'drizzle-orm';
import type { SettleOutboundBudgetOutcome } from '@voice-agent/contracts';
import {
  outboundBudgetReservations,
  type OutboundBudgetReservationEntity,
} from '../schema/outbound-budget-reservations.js';
import type { DatabaseExecutor } from './database-executor.js';
import { mapOutboundBudgetReservation } from './outbound-budget-mapping.js';

export function checkSettlementEligibility(
  reservation: OutboundBudgetReservationEntity | undefined,
): SettleOutboundBudgetOutcome | null {
  if (!reservation) {
    return {
      kind: 'RESERVATION_NOT_FOUND',
      reason: 'Reservation not found for organization and attempt.',
    };
  }
  if (reservation.status === 'COMMITTED') {
    return {
      kind: 'ALREADY_SETTLED',
      reservation: mapOutboundBudgetReservation(reservation),
    };
  }
  if (reservation.status === 'RELEASED') {
    return {
      kind: 'RESERVATION_ALREADY_RELEASED',
      reason: 'Cannot settle a reservation that was already released.',
    };
  }
  return null;
}

export interface CommitSettledReservationParams {
  readonly carrierCost: number;
  readonly conversationalCost: number;
  readonly totalActual: number;
  readonly now: Date;
}

export async function commitSettledReservation(
  tx: DatabaseExecutor,
  reservationId: string,
  params: CommitSettledReservationParams,
) {
  const [updated] = await tx
    .update(outboundBudgetReservations)
    .set({
      settledCarrierMinorUnits: params.carrierCost,
      settledConversationalMinorUnits: params.conversationalCost,
      settledAmountMinorUnits: params.totalActual,
      status: 'COMMITTED',
      settledAt: params.now,
      updatedAt: params.now,
    })
    .where(eq(outboundBudgetReservations.id, reservationId))
    .returning();

  if (!updated) {
    throw new Error('Failed to update settled outbound budget reservation');
  }
  return updated;
}
