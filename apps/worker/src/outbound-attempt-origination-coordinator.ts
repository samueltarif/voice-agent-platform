import {
  applyOutboundAttemptEvent,
  createOutboundAttempt,
  evaluateSuccessorAttempt,
  telephonyOriginationRequestSchema,
  type OutboundAttempt,
  type OutboundAttemptEventType,
  type TelephonyOriginationResult,
  type TelephonyReconciliationResult,
} from '@voice-agent/contracts';
import type {
  AttemptRef,
  OriginateResult,
  OutboundAttemptCoordinatorDependencies,
  PrepareAttemptInput,
  PrepareAttemptResult,
  StepResult,
} from './outbound-attempt-coordinator-types.js';
import { buildAttemptEvent } from './outbound-attempt-event-factory.js';
import { originationEventOf, reconciliationEventOf } from './outbound-attempt-event-mapping.js';

export type {
  AttemptRef,
  OriginateResult,
  OutboundAttemptCoordinatorDependencies,
  PrepareAttemptInput,
  PrepareAttemptResult,
  StepResult,
};

/**
 * Coordenação OFFLINE do ciclo de vida de uma tentativa. Não é um worker ativo,
 * não está ligado a nenhum dispatcher de produção e só fala com portas
 * injetadas (fakes nos testes). A chave de idempotência local protege efeitos
 * internos; NÃO é garantia exactly-once perante o exterior.
 */
export class OutboundAttemptOriginationCoordinator {
  constructor(private readonly deps: OutboundAttemptCoordinatorDependencies) {}

  async prepareAttempt(input: PrepareAttemptInput): Promise<PrepareAttemptResult> {
    const { store } = this.deps;
    const history = store.listByJob(input.organizationId, input.jobId);
    const decision = evaluateSuccessorAttempt(history, input);
    if (!decision.allowed) return { kind: 'BLOCKED', reason: decision.reason };
    const created = createOutboundAttempt({
      id: input.attemptId,
      organizationId: input.organizationId,
      jobId: input.jobId,
      campaignId: input.campaignId ?? null,
      attemptNumber: decision.nextAttemptNumber,
      correlationId: input.correlationId,
      agentId: input.agentId,
      agentVersionId: input.agentVersionId,
      jobIdempotencyKey: input.jobIdempotencyKey,
      createdAt: this.deps.now().toISOString(),
    });
    store.save(created);
    const intent = await this.step(input, 'INTENT_RECORDED');
    if (intent.kind !== 'APPLIED') throw new Error('Attempt intent could not be recorded.');
    return { kind: 'PREPARED', attempt: intent.attempt };
  }

  /** Write-ahead: o envio é registrado ANTES de qualquer chamada à porta. */
  markSendStarted(ref: AttemptRef): Promise<StepResult> {
    return this.step(ref, 'SEND_STARTED', { authorityId: this.deps.authorityId });
  }

  async originate(
    command: AttemptRef & { readonly destination: string },
  ): Promise<OriginateResult> {
    const attempt = this.deps.store.get(command.organizationId, command.attemptId);
    if (!attempt) return { kind: 'NOT_SENT', reason: 'NOT_FOUND' };
    const request = telephonyOriginationRequestSchema.safeParse({
      organizationId: attempt.organizationId,
      attemptId: attempt.id,
      jobId: attempt.jobId,
      ...(attempt.campaignId ? { campaignId: attempt.campaignId } : {}),
      correlationId: attempt.correlationId,
      agentId: attempt.agentId,
      agentVersionId: attempt.agentVersionId,
      destination: command.destination,
      idempotencyKey: attempt.idempotencyKey,
    });
    if (!request.success) return { kind: 'NOT_SENT', reason: 'INVALID_REQUEST' };
    const started = await this.markSendStarted(command);
    if (started.kind !== 'APPLIED') return { kind: 'NOT_SENT', reason: notSentReason(started) };
    const result = await this.callPort(request.data);
    const outcome = originationEventOf(result);
    return { kind: 'ORIGINATED', result: await this.step(command, outcome.type, outcome.extra) };
  }

  /** Reinício: toda tentativa deixada em SENT vira OUTCOME_UNKNOWN (nunca "falha"). */
  async recoverInterruptedAttempts(organizationId: string): Promise<number> {
    const interrupted = this.deps.store
      .listByOrganization(organizationId)
      .filter((attempt) => attempt.state === 'ORIGINATION_SENT');
    for (const attempt of interrupted) {
      await this.step({ organizationId, attemptId: attempt.id }, 'CRASH_RECOVERY_DETECTED');
    }
    return interrupted.length;
  }

  async reconcile(ref: AttemptRef): Promise<StepResult> {
    const requested = await this.step(ref, 'RECONCILIATION_REQUESTED');
    if (requested.kind === 'NOT_FOUND' || requested.kind === 'REJECTED') return requested;
    const result = await this.queryReconciliation(requested.attempt);
    const outcome = reconciliationEventOf(result);
    return this.step(ref, outcome.type, outcome.extra);
  }

  /** O esgotamento do prazo mantém o desfecho desconhecido e exige revisão manual. */
  expireReconciliation(ref: AttemptRef): Promise<StepResult> {
    return this.step(ref, 'RECONCILIATION_TIMED_OUT');
  }

  /** Entrada de eventos externos já autenticados por camadas futuras (008-OF4). */
  async applyEvent(input: AttemptRef & { readonly event: unknown }): Promise<StepResult> {
    const attempt = this.deps.store.get(input.organizationId, input.attemptId);
    if (!attempt) return { kind: 'NOT_FOUND' };
    const result = applyOutboundAttemptEvent(attempt, input.event);
    if (result.kind === 'APPLIED') this.deps.store.save(result.attempt);
    return result;
  }

  private async callPort(
    request: ReturnType<typeof telephonyOriginationRequestSchema.parse>,
  ): Promise<TelephonyOriginationResult> {
    try {
      return await this.deps.origination.originate(request);
    } catch {
      return { kind: 'UNKNOWN', reasonCode: 'TRANSPORT_ERROR' };
    }
  }

  private async queryReconciliation(
    attempt: OutboundAttempt,
  ): Promise<TelephonyReconciliationResult> {
    try {
      return await this.deps.reconciliation.reconcile({
        organizationId: attempt.organizationId,
        attemptId: attempt.id,
        jobId: attempt.jobId,
        correlationId: attempt.correlationId,
        providerReference: attempt.providerReference,
      });
    } catch {
      return { kind: 'INCONCLUSIVE' };
    }
  }

  private step(
    ref: AttemptRef,
    type: OutboundAttemptEventType,
    extra: Readonly<Record<string, unknown>> = {},
  ): Promise<StepResult> {
    const attempt = this.deps.store.get(ref.organizationId, ref.attemptId);
    if (!attempt) return Promise.resolve({ kind: 'NOT_FOUND' });
    const event = buildAttemptEvent({ attempt, type, clock: this.deps, extra });
    return this.applyEvent({ ...ref, event });
  }
}

function notSentReason(step: StepResult): string {
  if (step.kind === 'REJECTED') return step.reason;
  return step.kind === 'NOT_FOUND' ? 'NOT_FOUND' : 'ALREADY_PROCESSED';
}
