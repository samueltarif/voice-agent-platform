import { and, eq } from 'drizzle-orm';
import {
  telephonyOriginationRequestSchema,
  type TelephonyOriginationPort,
  type TelephonyOriginationRequest,
  type TelephonyOriginationResult,
  type TelephonyReconciliationPort,
  type TelephonyReconciliationResult,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { outboundCallJobs } from '../schema/outbound.js';
import type { DurableAttemptRecord } from './call-attempt-mapping.js';
import type { DrizzleCallAttemptRepository } from './call-attempt-repository.js';
import type { DurableApplyOutcome } from './durable-attempt-event-applier.js';

export interface DurableRunnerDependencies {
  readonly db: DatabaseInstance;
  readonly attempts: DrizzleCallAttemptRepository;
  readonly origination: TelephonyOriginationPort;
  readonly reconciliation: TelephonyReconciliationPort;
  readonly ownerId: string;
  readonly leaseMs: number;
  readonly newEventId: () => string;
  readonly now: () => Date;
}

export interface AttemptScope {
  readonly organizationId: string;
  readonly attemptId: string;
}

export type DurableRunResult =
  | { readonly kind: 'NOT_SENT'; readonly reason: string }
  | { readonly kind: 'COMPLETED'; readonly outcome: DurableApplyOutcome };

/**
 * Orquestração OFFLINE (fakes apenas; não ligada a dispatcher/runtime):
 * 1) valida o pedido; 2) claim + SEND_STARTED em transação; 3) chama a porta
 * FORA de transação; 4) finaliza com fencing. Uma queda entre 2 e 4 deixa
 * ORIGINATION_SENT, que a recuperação converte em OUTCOME_UNKNOWN.
 * NÃO há garantia exactly-once perante o exterior.
 */
export class DurableOutboundOriginationRunner {
  constructor(private readonly deps: DurableRunnerDependencies) {}

  async originate(scope: AttemptScope): Promise<DurableRunResult> {
    const record = await this.deps.attempts.getById(scope);
    if (!record) return { kind: 'NOT_SENT', reason: 'NOT_FOUND' };
    const request = await this.buildRequest(record);
    if (!request) return { kind: 'NOT_SENT', reason: 'INVALID_REQUEST' };
    const claim = await this.deps.attempts.claimSend({
      ...scope,
      ownerId: this.deps.ownerId,
      leaseMs: this.deps.leaseMs,
      eventId: this.deps.newEventId(),
      now: this.deps.now(),
    });
    if (claim.kind !== 'CLAIMED') return { kind: 'NOT_SENT', reason: claim.reason };
    const result = await this.callOrigination(request);
    const outcome = await this.deps.attempts.completeOrigination({
      ...scope,
      fence: claim.fence,
      result,
      eventId: this.deps.newEventId(),
      now: this.deps.now(),
    });
    return { kind: 'COMPLETED', outcome };
  }

  async reconcile(scope: AttemptScope): Promise<DurableRunResult> {
    const claim = await this.deps.attempts.claimReconciliation({
      ...scope,
      ownerId: this.deps.ownerId,
      leaseMs: this.deps.leaseMs,
      eventId: this.deps.newEventId(),
      now: this.deps.now(),
    });
    if (claim.kind !== 'CLAIMED') return { kind: 'NOT_SENT', reason: claim.reason };
    const result = await this.callReconciliation(claim.record);
    const outcome = await this.deps.attempts.completeReconciliation({
      ...scope,
      fence: claim.fence,
      result,
      eventId: this.deps.newEventId(),
      now: this.deps.now(),
    });
    return { kind: 'COMPLETED', outcome };
  }

  /** Destino resolvido no servidor a partir do job (PII não duplicada na tentativa). */
  private async buildRequest(
    record: DurableAttemptRecord,
  ): Promise<TelephonyOriginationRequest | null> {
    const { attempt } = record;
    const [job] = await this.deps.db
      .select({ destination: outboundCallJobs.destinationPhone })
      .from(outboundCallJobs)
      .where(
        and(
          eq(outboundCallJobs.id, attempt.jobId),
          eq(outboundCallJobs.organizationId, attempt.organizationId),
        ),
      );
    const parsed = telephonyOriginationRequestSchema.safeParse({
      organizationId: attempt.organizationId,
      attemptId: attempt.id,
      jobId: attempt.jobId,
      ...(attempt.campaignId ? { campaignId: attempt.campaignId } : {}),
      correlationId: attempt.correlationId,
      agentId: attempt.agentId,
      agentVersionId: attempt.agentVersionId,
      destination: job?.destination,
      idempotencyKey: attempt.idempotencyKey,
    });
    return parsed.success ? parsed.data : null;
  }

  private async callOrigination(
    request: TelephonyOriginationRequest,
  ): Promise<TelephonyOriginationResult> {
    try {
      return await this.deps.origination.originate(request);
    } catch {
      return { kind: 'UNKNOWN', reasonCode: 'TRANSPORT_ERROR' };
    }
  }

  private async callReconciliation(
    record: DurableAttemptRecord,
  ): Promise<TelephonyReconciliationResult> {
    const { attempt } = record;
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
}
