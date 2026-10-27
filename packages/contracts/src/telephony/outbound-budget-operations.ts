import { z } from 'zod';
import type { OutboundBudgetReservation } from './outbound-budget-types.js';

export const provisionOutboundBudgetLedgerInputSchema = z.object({
  organizationId: z.string().uuid(),
  currency: z.string().min(1).default('USD'),
  allocatedBudgetMinorUnits: z.number().int().nonnegative().default(0),
  maxConcurrentCalls: z.number().int().positive().default(5),
  maxDailyAttempts: z.number().int().positive().default(50),
});

export type ProvisionOutboundBudgetLedgerInput = z.input<
  typeof provisionOutboundBudgetLedgerInputSchema
>;

export const reserveOutboundBudgetInputSchema = z.object({
  organizationId: z.string().uuid(),
  attemptId: z.string().uuid(),
  jobId: z.string().uuid(),
  campaignId: z.string().uuid().optional().nullable(),
  estimatedAmountMinorUnits: z.number().int().positive(),
  estimatedCarrierMinorUnits: z.number().int().nonnegative().optional().default(0),
  estimatedConversationalMinorUnits: z.number().int().nonnegative().optional().default(0),
  idempotencyKey: z.string().min(1),
});

export type ReserveOutboundBudgetInput = z.input<typeof reserveOutboundBudgetInputSchema>;

export type ReserveOutboundBudgetOutcome =
  | {
      readonly kind: 'RESERVED';
      readonly reservation: OutboundBudgetReservation;
      readonly remainingAvailableMinorUnits: number;
    }
  | {
      readonly kind: 'ALREADY_RESERVED';
      readonly reservation: OutboundBudgetReservation;
    }
  | {
      readonly kind: 'INSUFFICIENT_FUNDS';
      readonly availableMinorUnits: number;
      readonly requestedMinorUnits: number;
      readonly reason: string;
    }
  | {
      readonly kind: 'CONCURRENCY_LIMIT_REACHED';
      readonly activeConcurrentCalls: number;
      readonly maxConcurrentCalls: number;
      readonly reason: string;
    }
  | {
      readonly kind: 'DAILY_QUOTA_EXCEEDED';
      readonly todayAttemptsCount: number;
      readonly maxDailyAttempts: number;
      readonly reason: string;
    };

export const settleOutboundBudgetInputSchema = z.object({
  organizationId: z.string().uuid(),
  attemptId: z.string().uuid(),
  actualCarrierCostMinorUnits: z.number().int().nonnegative(),
  actualConversationalCostMinorUnits: z.number().int().nonnegative(),
});

export type SettleOutboundBudgetInput = z.infer<typeof settleOutboundBudgetInputSchema>;

export type SettleOutboundBudgetOutcome =
  | {
      readonly kind: 'SETTLED';
      readonly reservation: OutboundBudgetReservation;
      readonly totalSettledMinorUnits: number;
      readonly unusedReservationRefundedMinorUnits: number;
    }
  | {
      readonly kind: 'ALREADY_SETTLED';
      readonly reservation: OutboundBudgetReservation;
    }
  | {
      readonly kind: 'RESERVATION_NOT_FOUND';
      readonly reason: string;
    }
  | {
      readonly kind: 'RESERVATION_ALREADY_RELEASED';
      readonly reason: string;
    };

export const releaseOutboundBudgetInputSchema = z.object({
  organizationId: z.string().uuid(),
  attemptId: z.string().uuid(),
  reason: z.string().min(1),
});

export type ReleaseOutboundBudgetInput = z.infer<typeof releaseOutboundBudgetInputSchema>;

export type ReleaseOutboundBudgetOutcome =
  | {
      readonly kind: 'RELEASED';
      readonly reservation: OutboundBudgetReservation;
      readonly releasedAmountMinorUnits: number;
    }
  | {
      readonly kind: 'ALREADY_RELEASED';
      readonly reservation: OutboundBudgetReservation;
    }
  | {
      readonly kind: 'ALREADY_SETTLED';
      readonly reservation: OutboundBudgetReservation;
      readonly reason: string;
    }
  | {
      readonly kind: 'RESERVATION_NOT_FOUND';
      readonly reason: string;
    };
