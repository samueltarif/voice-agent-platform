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
import { platformGlobalBudgetLedgers } from '../schema/platform-global-budget-ledger.js';
import type { DatabaseExecutor } from './database-executor.js';
import { mapOutboundBudgetReservation } from './outbound-budget-mapping.js';
import { GLOBAL_BUDGET_LEDGER_ID } from './outbound-budget-queries.js';

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

interface UnencumberInput {
  readonly orgId: string;
  readonly amount: number;
  readonly now: Date;
}

async function unencumberLedgers(tx: DatabaseExecutor, input: UnencumberInput): Promise<void> {
  const [globalRow] = await tx
    .select()
    .from(platformGlobalBudgetLedgers)
    .where(eq(platformGlobalBudgetLedgers.id, GLOBAL_BUDGET_LEDGER_ID))
    .for('update');

  if (globalRow) {
    await tx
      .update(platformGlobalBudgetLedgers)
      .set({
        reservedAmountMinorUnits: Math.max(0, globalRow.reservedAmountMinorUnits - input.amount),
        version: globalRow.version + 1,
        updatedAt: input.now,
      })
      .where(eq(platformGlobalBudgetLedgers.id, GLOBAL_BUDGET_LEDGER_ID));
  }

  const [tenantRow] = await tx
    .select()
    .from(outboundBudgetLedgers)
    .where(eq(outboundBudgetLedgers.organizationId, input.orgId))
    .for('update');

  if (tenantRow) {
    await tx
      .update(outboundBudgetLedgers)
      .set({
        reservedAmountMinorUnits: Math.max(0, tenantRow.reservedAmountMinorUnits - input.amount),
        version: tenantRow.version + 1,
        updatedAt: input.now,
      })
      .where(eq(outboundBudgetLedgers.id, tenantRow.id));
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

  const now = new Date();
  await unencumberLedgers(tx, {
    orgId: input.organizationId,
    amount: reservation!.reservedAmountMinorUnits,
    now,
  });

  const [updated] = await tx
    .update(outboundBudgetReservations)
    .set({
      status: 'RELEASED',
      releaseReason: input.reason,
      releasedAt: now,
      updatedAt: now,
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
