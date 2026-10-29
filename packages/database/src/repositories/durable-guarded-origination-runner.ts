import type { OutboundBudgetPort, ReserveOutboundBudgetOutcome } from '@voice-agent/contracts';
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

/**
 * Apenas uma reserva ainda pendente autoriza o envio. `ALREADY_RESERVED`
 * devolve o estado persistido, que pode estar RELEASED (tentativa anterior
 * abortada) ou COMMITTED (já liquidada); prosseguir nesses casos originaria
 * uma chamada sem fundos encumberados (fail-open).
 */
function resolveReservationBlock(outcome: ReserveOutboundBudgetOutcome): string | null {
  if (outcome.kind === 'RESERVED') return null;
  if (outcome.kind === 'ALREADY_RESERVED') {
    if (outcome.reservation.status === 'RESERVED') return null;
    return `BUDGET_BLOCKED:RESERVATION_NOT_PENDING:${outcome.reservation.status}`;
  }
  return `BUDGET_BLOCKED:${outcome.kind}`;
}

/**
 * Campanha pausada: nada é enviado e a tentativa fica pendente com a reserva
 * mantida para a retomada. Liberar aqui cancelaria a tentativa (prova de não
 * envio), e uma tentativa CANCELED bloqueia sucessoras — o contato seria
 * perdido por uma pausa.
 */
const HELD_FOR_RESUME: ReadonlySet<string> = new Set(['CAMPAIGN_PAUSED']);

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

    const block = resolveReservationBlock(outcome);
    if (block) return block;

    return null;
  }

  async originate(
    scope: AttemptScope,
    options?: GuardedOriginationOptions,
  ): Promise<DurableRunResult> {
    const errorReason = await this.prepareReservation(scope, options);
    if (errorReason) return { kind: 'NOT_SENT', reason: errorReason };

    const runResult = await this.deps.runner.originate(scope);
    if (runResult.kind === 'NOT_SENT' && !HELD_FOR_RESUME.has(runResult.reason)) {
      await this.deps.budget.releaseBudget({
        organizationId: scope.organizationId,
        attemptId: scope.attemptId,
        reason: `ORIGINATION_ABORTED:${runResult.reason}`,
      });
    }

    return runResult;
  }
}
