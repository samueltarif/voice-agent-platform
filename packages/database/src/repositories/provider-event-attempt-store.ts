import { eq } from 'drizzle-orm';
import type { OutboundAttemptState } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { callAttempts } from '../schema/call-attempts.js';
import { DrizzleCallAttemptRepository } from './call-attempt-repository.js';
import type { ProviderEventOrigin } from './call-event-store.js';
import type { DurableApplyOutcome } from './durable-attempt-event-applier.js';

export type { ProviderEventOrigin };

/** Escopo autoritativo derivado SOMENTE do banco (nunca do payload externo). */
export interface ProviderResolvedAttempt {
  readonly id: string;
  readonly organizationId: string;
  readonly jobId: string;
  readonly state: OutboundAttemptState;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly callSessionId: string | null;
}

export type ProviderAttemptResolution =
  | { readonly kind: 'RESOLVED'; readonly attempt: ProviderResolvedAttempt }
  | { readonly kind: 'UNKNOWN' }
  | { readonly kind: 'AMBIGUOUS' };

export interface ApplyProviderEventInput {
  readonly attempt: ProviderResolvedAttempt;
  readonly event: Record<string, unknown>;
  readonly origin: ProviderEventOrigin;
  readonly now: Date;
}

/**
 * 008-OF4 — correlação de eventos de provedor. A referência opaca do provedor
 * é buscada entre TODOS os tenants: 0 linhas = desconhecida; 2+ linhas =
 * ambígua (nenhum efeito). A aplicação reutiliza a FSM durável da 008-OF2
 * (deduplicação por `event_id`, monotonicidade, trilha append-only).
 */
export class DrizzleProviderEventAttemptStore {
  private readonly attempts: DrizzleCallAttemptRepository;

  constructor(private readonly db: DatabaseInstance) {
    this.attempts = new DrizzleCallAttemptRepository(db);
  }

  async resolveByProviderReference(reference: string): Promise<ProviderAttemptResolution> {
    const rows = await this.db
      .select({
        id: callAttempts.id,
        organizationId: callAttempts.organizationId,
        jobId: callAttempts.jobId,
        state: callAttempts.state,
        agentId: callAttempts.agentId,
        agentVersionId: callAttempts.agentVersionId,
        callSessionId: callAttempts.callSessionId,
      })
      .from(callAttempts)
      .where(eq(callAttempts.providerReference, reference))
      .limit(2);
    if (rows.length === 0) return { kind: 'UNKNOWN' };
    if (rows.length > 1) return { kind: 'AMBIGUOUS' };
    return { kind: 'RESOLVED', attempt: rows[0]! };
  }

  applyProviderEvent(input: ApplyProviderEventInput): Promise<DurableApplyOutcome> {
    return this.attempts.applyEvent({
      organizationId: input.attempt.organizationId,
      attemptId: input.attempt.id,
      event: input.event,
      now: input.now,
      origin: input.origin,
    });
  }
}
