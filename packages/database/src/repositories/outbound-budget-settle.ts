import { and, eq } from 'drizzle-orm';
import type {
  SettleOutboundBudgetInput,
  SettleOutboundBudgetOutcome,
} from '@voice-agent/contracts';
import { outboundBudgetLedgers } from '../schema/outbound-budget-ledgers.js';
import {
  outboundBudgetReservations,
  type OutboundBudgetReservationEntity,
} from '../schema/outbound-budget-reservations.js';
import type { DatabaseExecutor } from './database-executor.js';
import { mapOutboundBudgetReservation } from './outbound-budget-mapping.js';

function checkSettlementEligibility(
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

interface SettlementCalculationInput {
  readonly orgId: string;
  readonly reservedAmount: number;
  readonly actualCarrierCost: number;
  readonly actualConversationalCost: number;
}

async function applyLedgerSettlement(
  tx: DatabaseExecutor,
  input: SettlementCalculationInput,
): Promise<void> {
  const [ledger] = await tx
    .select()
    .from(outboundBudgetLedgers)
    .where(eq(outboundBudgetLedgers.organizationId, input.orgId))
    .for('update');

  if (ledger) {
    const totalActual = input.actualCarrierCost + input.actualConversationalCost;
    await tx
      .update(outboundBudgetLedgers)
      .set({
        reservedAmountMinorUnits: Math.max(
          0,
          ledger.reservedAmountMinorUnits - input.reservedAmount,
        ),
        spentCarrierMinorUnits: ledger.spentCarrierMinorUnits + input.actualCarrierCost,
        spentConversationalMinorUnits:
          ledger.spentConversationalMinorUnits + input.actualConversationalCost,
        spentAmountMinorUnits: ledger.spentAmountMinorUnits + totalActual,
        version: ledger.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(outboundBudgetLedgers.id, ledger.id));
  }
}

export async function settleBudgetInTransaction(
  tx: DatabaseExecutor,
  input: SettleOutboundBudgetInput,
): Promise<SettleOutboundBudgetOutcome> {
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

  const ineligibility = checkSettlementEligibility(reservation);
  if (ineligibility) return ineligibility;

  await applyLedgerSettlement(tx, {
    orgId: input.organizationId,
    reservedAmount: reservation!.reservedAmountMinorUnits,
    actualCarrierCost: input.actualCarrierCostMinorUnits,
    actualConversationalCost: input.actualConversationalCostMinorUnits,
  });

  const actualTotal = input.actualCarrierCostMinorUnits + input.actualConversationalCostMinorUnits;
  const unusedRefund = Math.max(0, reservation!.reservedAmountMinorUnits - actualTotal);
  const now = new Date();

  const [updated] = await tx
    .update(outboundBudgetReservations)
    .set({
      settledCarrierMinorUnits: input.actualCarrierCostMinorUnits,
      settledConversationalMinorUnits: input.actualConversationalCostMinorUnits,
      settledAmountMinorUnits: actualTotal,
      status: 'COMMITTED',
      settledAt: now,
      updatedAt: now,
    })
    .where(eq(outboundBudgetReservations.id, reservation!.id))
    .returning();

  if (!updated) {
    throw new Error('Failed to update settled outbound budget reservation');
  }

  return {
    kind: 'SETTLED',
    reservation: mapOutboundBudgetReservation(updated),
    totalSettledMinorUnits: actualTotal,
    unusedReservationRefundedMinorUnits: unusedRefund,
  };
}
