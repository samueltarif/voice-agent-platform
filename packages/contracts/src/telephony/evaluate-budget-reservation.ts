import type { OutboundBudgetLedger } from './outbound-budget-contracts.js';

export interface BudgetEvaluationInput {
  readonly ledger: OutboundBudgetLedger;
  readonly requestedAmountMinorUnits: number;
  readonly activeConcurrentCalls: number;
  readonly todayAttemptsCount: number;
}

export type BudgetEvaluationDecision =
  | { readonly allowed: true; readonly availableMinorUnits: number }
  | {
      readonly allowed: false;
      readonly reason: 'INSUFFICIENT_FUNDS';
      readonly availableMinorUnits: number;
      readonly requestedMinorUnits: number;
    }
  | {
      readonly allowed: false;
      readonly reason: 'CONCURRENCY_LIMIT_REACHED';
      readonly activeConcurrentCalls: number;
      readonly maxConcurrentCalls: number;
    }
  | {
      readonly allowed: false;
      readonly reason: 'DAILY_QUOTA_EXCEEDED';
      readonly todayAttemptsCount: number;
      readonly maxDailyAttempts: number;
    };

export function calculateAvailableBudget(
  ledger: Pick<
    OutboundBudgetLedger,
    'allocatedBudgetMinorUnits' | 'reservedAmountMinorUnits' | 'spentAmountMinorUnits'
  >,
): number {
  const encumbered = ledger.reservedAmountMinorUnits + ledger.spentAmountMinorUnits;
  return Math.max(0, ledger.allocatedBudgetMinorUnits - encumbered);
}

export function evaluateBudgetReservation(input: BudgetEvaluationInput): BudgetEvaluationDecision {
  if (input.activeConcurrentCalls >= input.ledger.maxConcurrentCalls) {
    return {
      allowed: false,
      reason: 'CONCURRENCY_LIMIT_REACHED',
      activeConcurrentCalls: input.activeConcurrentCalls,
      maxConcurrentCalls: input.ledger.maxConcurrentCalls,
    };
  }

  if (input.todayAttemptsCount >= input.ledger.maxDailyAttempts) {
    return {
      allowed: false,
      reason: 'DAILY_QUOTA_EXCEEDED',
      todayAttemptsCount: input.todayAttemptsCount,
      maxDailyAttempts: input.ledger.maxDailyAttempts,
    };
  }

  const available = calculateAvailableBudget(input.ledger);
  if (available < input.requestedAmountMinorUnits) {
    return {
      allowed: false,
      reason: 'INSUFFICIENT_FUNDS',
      availableMinorUnits: available,
      requestedMinorUnits: input.requestedAmountMinorUnits,
    };
  }

  return { allowed: true, availableMinorUnits: available };
}
