import { z } from 'zod';
import { outboundAttemptStateSchema, type OutboundAttemptState } from './outbound-attempt-state.js';

/**
 * Tentativa de discagem. Identidade e histórico são imutáveis: uma nova
 * tentativa recebe novo `id` e `attemptNumber`; nunca reutiliza os anteriores.
 * Não armazena o número de destino (minimização de PII): o destino pertence
 * ao job e é fornecido apenas no momento da originação.
 */
export interface OutboundAttempt {
  readonly id: string;
  readonly organizationId: string;
  readonly jobId: string;
  readonly campaignId: string | null;
  readonly attemptNumber: number;
  readonly correlationId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  /** Proteção de efeitos INTERNOS; não é garantia exactly-once perante o exterior. */
  readonly idempotencyKey: string;
  readonly state: OutboundAttemptState;
  readonly originationAuthorityId: string | null;
  /** Referência externa opaca e NÃO CONFIÁVEL até validação contratual. */
  readonly providerReference: string | null;
  readonly callSessionId: string | null;
  readonly reconciliationAttempts: number;
  readonly requiresManualReview: boolean;
  readonly appliedEventIds: readonly string[];
  readonly lastEventAt: string | null;
  readonly createdAt: string;
}

export const createOutboundAttemptInputSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    jobId: z.string().uuid(),
    campaignId: z.string().uuid().nullable().default(null),
    attemptNumber: z.number().int().positive(),
    correlationId: z.string().uuid(),
    agentId: z.string().uuid(),
    agentVersionId: z.string().uuid(),
    jobIdempotencyKey: z.string().trim().min(1),
    createdAt: z.string().datetime(),
  })
  .strict();

export type CreateOutboundAttemptInput = z.input<typeof createOutboundAttemptInputSchema>;

/** Mesmo formato já usado pelo dispatcher de jobs (`<chave>-att-<n>`). */
export function deriveAttemptIdempotencyKey(
  jobIdempotencyKey: string,
  attemptNumber: number,
): string {
  return `${jobIdempotencyKey}-att-${attemptNumber}`;
}

export function createOutboundAttempt(input: CreateOutboundAttemptInput): OutboundAttempt {
  const parsed = createOutboundAttemptInputSchema.parse(input);
  return {
    id: parsed.id,
    organizationId: parsed.organizationId,
    jobId: parsed.jobId,
    campaignId: parsed.campaignId,
    attemptNumber: parsed.attemptNumber,
    correlationId: parsed.correlationId,
    agentId: parsed.agentId,
    agentVersionId: parsed.agentVersionId,
    idempotencyKey: deriveAttemptIdempotencyKey(parsed.jobIdempotencyKey, parsed.attemptNumber),
    state: outboundAttemptStateSchema.parse('CREATED'),
    originationAuthorityId: null,
    providerReference: null,
    callSessionId: null,
    reconciliationAttempts: 0,
    requiresManualReview: false,
    appliedEventIds: [],
    lastEventAt: null,
    createdAt: parsed.createdAt,
  };
}
