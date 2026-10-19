import { z } from 'zod';
import { e164DestinationSchema } from './e164-destination.js';
import type {
  OriginationRejectionReason,
  OriginationUnknownReason,
} from './outbound-attempt-event.js';

/**
 * Intenção de iniciar UMA tentativa de discagem. Contrato provider-neutral:
 * não contém objetos, enums, formatos de ID ou payloads de nenhum provedor.
 */
export const telephonyOriginationRequestSchema = z
  .object({
    organizationId: z.string().uuid(),
    attemptId: z.string().uuid(),
    jobId: z.string().uuid(),
    campaignId: z.string().uuid().optional(),
    correlationId: z.string().uuid(),
    agentId: z.string().uuid(),
    agentVersionId: z.string().uuid(),
    destination: e164DestinationSchema,
    /** Chave LOCAL; não presume suporte a idempotência no provedor. */
    idempotencyKey: z.string().trim().min(1),
  })
  .strict();

export type TelephonyOriginationRequest = z.infer<typeof telephonyOriginationRequestSchema>;

/** Resultado neutro: confirmado, rejeitado ou desconhecido (nunca presumido). */
export type TelephonyOriginationResult =
  | { readonly kind: 'ACCEPTED'; readonly providerReference?: string | undefined }
  | { readonly kind: 'REJECTED'; readonly reasonCode: OriginationRejectionReason }
  | { readonly kind: 'UNKNOWN'; readonly reasonCode: OriginationUnknownReason };

/** Autoridade ÚNICA de originação por tentativa. */
export interface TelephonyOriginationPort {
  readonly providerName: string;
  originate(request: TelephonyOriginationRequest): Promise<TelephonyOriginationResult>;
}

export interface TelephonyReconciliationRequest {
  readonly organizationId: string;
  readonly attemptId: string;
  readonly jobId: string;
  readonly correlationId: string;
  readonly providerReference: string | null;
}

export type TelephonyReconciliationResult =
  | { readonly kind: 'CONFIRMED_ORIGINATED'; readonly providerReference?: string | undefined }
  | { readonly kind: 'CONFIRMED_NOT_ORIGINATED' }
  | { readonly kind: 'INCONCLUSIVE' };

/** Consulta de desfecho. Suporte real por provedor é PROVIDER-UNVERIFIED. */
export interface TelephonyReconciliationPort {
  reconcile(request: TelephonyReconciliationRequest): Promise<TelephonyReconciliationResult>;
}
