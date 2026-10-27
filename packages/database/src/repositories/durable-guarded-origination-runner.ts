import type { OutboundBudgetPort } from '@voice-agent/contracts';
import type { DrizzleCallAttemptRepository } from './call-attempt-repository.js';
import type {
  AttemptScope,
  DurableOutboundOriginationRunner,
  DurableRunResult,
} from './durable-outbound-origination-runner.js';

export interface GuardedOriginationOptions {
  readonly estimatedCostMinorUnits?: number;
  readonly estimatedCarrierMinorUnits?: number;
  readonly estimatedConversationalMinorUnits?: number;
}

export interface GuardedRunnerDependencies {
  readonly runner: DurableOutboundOriginationRunner;
  readonly attempts: DrizzleCallAttemptRepository;
  readonly budget: OutboundBudgetPort;
  readonly defaultEstimatedCostMinorUnits?: number;
}

function resolveEstimatedAmounts(options?: GuardedOriginationOptions, defaultCost = 500) {
  const total = options?.estimatedCostMinorUnits ?? defaultCost;
  const carrier = options?.estimatedCarrierMinorUnits ?? 0;
  const conversational = options?.estimatedConversationalMinorUnits ?? 0;
  return { total, carrier, conversational };
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

    const estimates = resolveEstimatedAmounts(options, this.deps.defaultEstimatedCostMinorUnits);

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
