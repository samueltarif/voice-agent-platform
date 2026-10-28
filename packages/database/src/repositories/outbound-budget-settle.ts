import { and, eq } from 'drizzle-orm';
import type {
  SettleOutboundBudgetInput,
  SettleOutboundBudgetOutcome,
} from '@voice-agent/contracts';
import { outboundBudgetLedgers } from '../schema/outbound-budget-ledgers.js';
import { outboundBudgetReservations } from '../schema/outbound-budget-reservations.js';
import { platformGlobalBudgetLedgers } from '../schema/platform-global-budget-ledger.js';
import type { DatabaseExecutor } from './database-executor.js';
import { mapOutboundBudgetReservation } from './outbound-budget-mapping.js';
import { GLOBAL_BUDGET_LEDGER_ID } from './outbound-budget-queries.js';
import {
  checkSettlementEligibility,
  commitSettledReservation,
} from './outbound-budget-settle-record.js';

interface SettlementLedgerParams {
  readonly orgId: string;
  readonly reservedAmount: number;
  readonly carrierCost: number;
  readonly conversationalCost: number;
  readonly totalActual: number;
  readonly now: Date;
}

async function updateGlobalLedgerSettlement(
  tx: DatabaseExecutor,
  params: SettlementLedgerParams,
): Promise<void> {
  const [globalRow] = await tx
    .select()
    .from(platformGlobalBudgetLedgers)
    .where(eq(platformGlobalBudgetLedgers.id, GLOBAL_BUDGET_LEDGER_ID))
    .for('update');

  if (globalRow) {
    await tx
      .update(platformGlobalBudgetLedgers)
      .set({
        reservedAmountMinorUnits: Math.max(
          0,
          globalRow.reservedAmountMinorUnits - params.reservedAmount,
        ),
        spentCarrierMinorUnits: globalRow.spentCarrierMinorUnits + params.carrierCost,
        spentConversationalMinorUnits:
          globalRow.spentConversationalMinorUnits + params.conversationalCost,
        spentAmountMinorUnits: globalRow.spentAmountMinorUnits + params.totalActual,
        version: globalRow.version + 1,
        updatedAt: params.now,
      })
      .where(eq(platformGlobalBudgetLedgers.id, GLOBAL_BUDGET_LEDGER_ID));
  }
}

async function updateTenantLedgerSettlement(
  tx: DatabaseExecutor,
  params: SettlementLedgerParams,
): Promise<void> {
  const [tenantRow] = await tx
    .select()
    .from(outboundBudgetLedgers)
    .where(eq(outboundBudgetLedgers.organizationId, params.orgId))
    .for('update');

  if (tenantRow) {
    await tx
      .update(outboundBudgetLedgers)
      .set({
        reservedAmountMinorUnits: Math.max(
          0,
          tenantRow.reservedAmountMinorUnits - params.reservedAmount,
        ),
        spentCarrierMinorUnits: tenantRow.spentCarrierMinorUnits + params.carrierCost,
        spentConversationalMinorUnits:
          tenantRow.spentConversationalMinorUnits + params.conversationalCost,
        spentAmountMinorUnits: tenantRow.spentAmountMinorUnits + params.totalActual,
        version: tenantRow.version + 1,
        updatedAt: params.now,
      })
      .where(eq(outboundBudgetLedgers.id, tenantRow.id));
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

  const carrierCost = input.actualCarrierCostMinorUnits;
  const conversationalCost = input.actualConversationalCostMinorUnits;
  const totalActual = carrierCost + conversationalCost;
  const reservedAmount = reservation!.reservedAmountMinorUnits;
  const now = new Date();

  const ledgerParams: SettlementLedgerParams = {
    orgId: input.organizationId,
    reservedAmount,
    carrierCost,
    conversationalCost,
    totalActual,
    now,
  };
  await updateGlobalLedgerSettlement(tx, ledgerParams);
  await updateTenantLedgerSettlement(tx, ledgerParams);

  const updated = await commitSettledReservation(tx, reservation!.id, {
    carrierCost,
    conversationalCost,
    totalActual,
    now,
  });

  return {
    kind: 'SETTLED',
    reservation: mapOutboundBudgetReservation(updated),
    totalSettledMinorUnits: totalActual,
    unusedReservationRefundedMinorUnits: Math.max(0, reservedAmount - totalActual),
    overageMinorUnits: Math.max(0, totalActual - reservedAmount),
  };
}
