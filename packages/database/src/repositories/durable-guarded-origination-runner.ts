import type { OutboundBudgetPort } from '@voice-agent/contracts';
import type { DrizzleCallAttemptRepository } from './call-attempt-repository.js';
import type {
  AttemptScope,
  DurableOutboundOriginationRunner,
  DurableRunResult,
} from './durable-outbound-origination-runner.js';

export interface GuardedOriginationOptions {
  readonly estimatedCarrierMinorUnits: number;
  readonly estimatedConversationalMinorUnits: number;
  readonly estimatedCostMinorUnits?: number;
}

export interface GuardedRunnerDependencies {
  readonly runner: DurableOutboundOriginationRunner;
  readonly attempts: DrizzleCallAttemptRepository;
  readonly budget: OutboundBudgetPort;
}

function resolveEstimatedAmounts(options?: GuardedOriginationOptions) {
  if (!options) return null;
  const { estimatedCarrierMinorUnits, estimatedConversationalMinorUnits } = options;
  if (
    typeof estimatedCarrierMinorUnits !== 'number' ||
    estimatedCarrierMinorUnits <= 0 ||
    typeof estimatedConversationalMinorUnits !== 'number' ||
    estimatedConversationalMinorUnits <= 0
  ) {
    return null;
  }
  const total =
    options.estimatedCostMinorUnits ??
    estimatedCarrierMinorUnits + estimatedConversationalMinorUnits;
  if (total <= 0) return null;
  return {
    total,
    carrier: estimatedCarrierMinorUnits,
    conversational: estimatedConversationalMinorUnits,
  };
}

function isReservationSuccessful(kind: string): boolean {
  return kind === 'RESERVED' || kind === 'ALREADY_RESERVED';
}

export class DurableGuardedOriginationRunner {
  constructor(private readonly deps: GuardedRunnerDependencies) {}

  private async prepareReservation(
    scope: AttemptScope,
    options?: GuardedOriginationOptions,
  ): Promise<string | null> {
    const record = await this.deps.attempts.getById(scope);
    if (!record) return 'NOT_FOUND';

    const estimates = resolveEstimatedAmounts(options);
    if (!estimates) {
      return 'ESTIMATED_COST_REQUIRED';
    }

    const outcome = await this.deps.budget.reserveBudget({
      organizationId: scope.organizationId,
      attemptId: scope.attemptId,
      jobId: record.attempt.jobId,
      estimatedAmountMinorUnits: estimates.total,
      estimatedCarrierMinorUnits: estimates.carrier,
      estimatedConversationalMinorUnits: estimates.conversational,
      idempotencyKey: record.attempt.idempotencyKey,
    });

    if (!isReservationSuccessful(outcome.kind)) {
      return `BUDGET_BLOCKED:${outcome.kind}`;
    }

    return null;
  }

  async originate(
    scope: AttemptScope,
    options?: GuardedOriginationOptions,
  ): Promise<DurableRunResult> {
    const errorReason = await this.prepareReservation(scope, options);
    if (errorReason) return { kind: 'NOT_SENT', reason: errorReason };

    const runResult = await this.deps.runner.originate(scope);
    if (runResult.kind === 'NOT_SENT') {
      await this.deps.budget.releaseBudget({
        organizationId: scope.organizationId,
        attemptId: scope.attemptId,
        reason: `ORIGINATION_ABORTED:${runResult.reason}`,
      });
    }

    return runResult;
  }
}
