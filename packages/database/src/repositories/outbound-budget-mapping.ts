import type { OutboundBudgetLedger, OutboundBudgetReservation } from '@voice-agent/contracts';
import { calculateAvailableBudget } from '@voice-agent/contracts';
import type { OutboundBudgetLedgerEntity } from '../schema/outbound-budget-ledgers.js';
import type { OutboundBudgetReservationEntity } from '../schema/outbound-budget-reservations.js';

export function mapOutboundBudgetLedger(row: OutboundBudgetLedgerEntity): OutboundBudgetLedger {
  return {
    id: row.id,
    organizationId: row.organizationId,
    currency: row.currency,
    allocatedBudgetMinorUnits: row.allocatedBudgetMinorUnits,
    reservedAmountMinorUnits: row.reservedAmountMinorUnits,
    spentCarrierMinorUnits: row.spentCarrierMinorUnits,
    spentConversationalMinorUnits: row.spentConversationalMinorUnits,
    spentAmountMinorUnits: row.spentAmountMinorUnits,
    availableAmountMinorUnits: calculateAvailableBudget(row),
    maxConcurrentCalls: row.maxConcurrentCalls,
    maxDailyAttempts: row.maxDailyAttempts,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapOutboundBudgetReservation(
  row: OutboundBudgetReservationEntity,
): OutboundBudgetReservation {
  return {
    id: row.id,
    organizationId: row.organizationId,
    attemptId: row.attemptId,
    jobId: row.jobId,
    reservedAmountMinorUnits: row.reservedAmountMinorUnits,
    reservedCarrierMinorUnits: row.reservedCarrierMinorUnits,
    reservedConversationalMinorUnits: row.reservedConversationalMinorUnits,
    settledCarrierMinorUnits: row.settledCarrierMinorUnits,
    settledConversationalMinorUnits: row.settledConversationalMinorUnits,
    settledAmountMinorUnits: row.settledAmountMinorUnits,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    releaseReason: row.releaseReason,
    reservedAt: row.reservedAt,
    settledAt: row.settledAt,
    releasedAt: row.releasedAt,
  };
}
