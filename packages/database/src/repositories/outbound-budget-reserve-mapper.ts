import type {
  ReserveOutboundBudgetOutcome,
  BudgetEvaluationDecision,
} from '@voice-agent/contracts';

export function mapDecisionToBlockOutcome(
  decision: Exclude<BudgetEvaluationDecision, { allowed: true }>,
): ReserveOutboundBudgetOutcome {
  if (decision.reason === 'GLOBAL_LEDGER_NOT_FOUND') {
    return { kind: 'GLOBAL_LEDGER_NOT_FOUND', reason: 'Global budget ledger not found.' };
  }
  if (decision.reason === 'GLOBAL_CONCURRENCY_LIMIT_REACHED') {
    return {
      kind: 'GLOBAL_CONCURRENCY_LIMIT_REACHED',
      activeConcurrentCalls: decision.activeConcurrentCalls,
      maxConcurrentCalls: decision.maxConcurrentCalls,
      reason: 'Global platform concurrent call limit reached.',
    };
  }
  if (decision.reason === 'GLOBAL_INSUFFICIENT_FUNDS') {
    return {
      kind: 'GLOBAL_INSUFFICIENT_FUNDS',
      availableMinorUnits: decision.availableMinorUnits,
      requestedMinorUnits: decision.requestedMinorUnits,
      reason: 'Global platform budget exhausted.',
    };
  }
  if (decision.reason === 'CONCURRENCY_LIMIT_REACHED') {
    return {
      kind: 'CONCURRENCY_LIMIT_REACHED',
      activeConcurrentCalls: decision.activeConcurrentCalls,
      maxConcurrentCalls: decision.maxConcurrentCalls,
      reason: 'Active concurrent call limit reached for organization.',
    };
  }
  if (decision.reason === 'DAILY_QUOTA_EXCEEDED') {
    return {
      kind: 'DAILY_QUOTA_EXCEEDED',
      todayAttemptsCount: decision.todayAttemptsCount,
      maxDailyAttempts: decision.maxDailyAttempts,
      reason: 'Daily attempt quota exceeded for organization.',
    };
  }
  return {
    kind: 'INSUFFICIENT_FUNDS',
    availableMinorUnits: decision.availableMinorUnits,
    requestedMinorUnits: decision.requestedMinorUnits,
    reason: 'Insufficient available budget for reservation.',
  };
}
