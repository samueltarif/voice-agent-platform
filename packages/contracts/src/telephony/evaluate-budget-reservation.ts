import type {
  OutboundBudgetLedger,
  PlatformGlobalBudgetLedger,
} from './outbound-budget-contracts.js';

export interface BudgetEvaluationInput {
  readonly globalLedger?: PlatformGlobalBudgetLedger | null;
  readonly globalActiveConcurrentCalls?: number;
  readonly ledger: OutboundBudgetLedger;
  readonly requestedAmountMinorUnits: number;
  readonly activeConcurrentCalls: number;
  readonly todayAttemptsCount: number;
}

export type BudgetEvaluationDecision =
  | {
      readonly allowed: true;
      readonly availableMinorUnits: number;
      readonly globalAvailableMinorUnits?: number;
    }
  | {
      readonly allowed: false;
      readonly reason: 'GLOBAL_LEDGER_NOT_FOUND';
    }
  | {
      readonly allowed: false;
      readonly reason: 'GLOBAL_CONCURRENCY_LIMIT_REACHED';
      readonly activeConcurrentCalls: number;
      readonly maxConcurrentCalls: number;
    }
  | {
      readonly allowed: false;
      readonly reason: 'GLOBAL_INSUFFICIENT_FUNDS';
      readonly availableMinorUnits: number;
      readonly requestedMinorUnits: number;
    }
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

type GlobalConstraintsResult =
  | Exclude<BudgetEvaluationDecision, { allowed: true }>
  | { readonly allowed: true; readonly globalAvailable: number };

function evaluateGlobalConstraints(input: BudgetEvaluationInput): GlobalConstraintsResult {
  if (!input.globalLedger) {
    return { allowed: false, reason: 'GLOBAL_LEDGER_NOT_FOUND' };
  }

  const globalActive = input.globalActiveConcurrentCalls ?? 0;
  if (globalActive >= input.globalLedger.maxConcurrentCalls) {
    return {
      allowed: false,
      reason: 'GLOBAL_CONCURRENCY_LIMIT_REACHED',
      activeConcurrentCalls: globalActive,
      maxConcurrentCalls: input.globalLedger.maxConcurrentCalls,
    };
  }

  const globalAvailable = calculateAvailableBudget(input.globalLedger);
  if (globalAvailable < input.requestedAmountMinorUnits) {
    return {
      allowed: false,
      reason: 'GLOBAL_INSUFFICIENT_FUNDS',
      availableMinorUnits: globalAvailable,
      requestedMinorUnits: input.requestedAmountMinorUnits,
    };
  }

  return { allowed: true, globalAvailable };
}

export function evaluateBudgetReservation(input: BudgetEvaluationInput): BudgetEvaluationDecision {
  const globalResult = evaluateGlobalConstraints(input);
  if (!globalResult.allowed) return globalResult;

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

  return {
    allowed: true,
    availableMinorUnits: available,
    globalAvailableMinorUnits: globalResult.globalAvailable,
  };
}
