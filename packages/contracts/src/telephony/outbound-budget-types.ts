import { z } from 'zod';

export const OUTBOUND_BUDGET_RESERVATION_STATUSES = ['RESERVED', 'COMMITTED', 'RELEASED'] as const;

export type OutboundBudgetReservationStatus = (typeof OUTBOUND_BUDGET_RESERVATION_STATUSES)[number];

export const outboundBudgetReservationStatusSchema = z.enum(OUTBOUND_BUDGET_RESERVATION_STATUSES);

export interface OutboundBudgetLedger {
  readonly id: string;
  readonly organizationId: string;
  readonly currency: string;
  readonly allocatedBudgetMinorUnits: number;
  readonly reservedAmountMinorUnits: number;
  readonly spentCarrierMinorUnits: number;
  readonly spentConversationalMinorUnits: number;
  readonly spentAmountMinorUnits: number;
  readonly availableAmountMinorUnits: number;
  readonly maxConcurrentCalls: number;
  readonly maxDailyAttempts: number;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OutboundBudgetReservation {
  readonly id: string;
  readonly organizationId: string;
  readonly attemptId: string;
  readonly jobId: string;
  readonly campaignId?: string | null;
  readonly reservedAmountMinorUnits: number;
  readonly reservedCarrierMinorUnits: number;
  readonly reservedConversationalMinorUnits: number;
  readonly settledCarrierMinorUnits: number;
  readonly settledConversationalMinorUnits: number;
  readonly settledAmountMinorUnits: number;
  readonly status: OutboundBudgetReservationStatus;
  readonly idempotencyKey: string;
  readonly releaseReason?: string | null;
  readonly reservedAt: Date;
  readonly settledAt?: Date | null;
  readonly releasedAt?: Date | null;
}
