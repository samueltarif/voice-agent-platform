import { z } from 'zod';
import type { OutboundAttemptEventType } from './outbound-attempt-event.js';
import { originationRejectionReasonSchema } from './outbound-attempt-event.js';
import { postCallReportSchema } from '../scheduling/post-call-report.js';

/**
 * 008-OF4 — Ingress de webhooks PROVIDER-NEUTRAL.
 * Nenhum esquema oficial de provedor (DEC-042) é presumido aqui: cada
 * provedor terá um autenticador e um normalizador próprios (008-OF5), ambos
 * `PROVIDER-UNVERIFIED` até homologação contratual. Sem autenticador
 * configurado, TODA entrega é rejeitada (fail-closed).
 */
export interface ProviderWebhookRequest {
  readonly provider: string;
  /** Cabeçalhos com nomes em minúsculas. */
  readonly headers: Readonly<Record<string, string>>;
  /** Corpo bruto exatamente como recebido (assinaturas dependem dele). */
  readonly rawBody: string;
  /**
   * Parâmetros da URL com valor ÚNICO (repetidos são omitidos). Alguns
   * provedores só autenticam por token na URL (E2-V: relatório pós-chamada);
   * nunca registrar em log.
   */
  readonly query?: Readonly<Record<string, string>>;
  readonly receivedAt: Date;
}

export const WEBHOOK_AUTH_REJECTION_REASONS = [
  'NOT_CONFIGURED',
  'MISSING_CREDENTIALS',
  'INVALID_CREDENTIALS',
  'REPLAY_WINDOW_EXCEEDED',
] as const;
export type WebhookAuthRejectionReason = (typeof WEBHOOK_AUTH_REJECTION_REASONS)[number];

export type WebhookAuthOutcome =
  | { readonly kind: 'AUTHENTICATED' }
  | { readonly kind: 'REJECTED'; readonly reason: WebhookAuthRejectionReason };

/** Autenticação da ENTREGA (assinatura/token + janela anti-replay do provedor). */
export interface ProviderWebhookAuthenticator {
  authenticate(request: ProviderWebhookRequest): Promise<WebhookAuthOutcome>;
}

/** Padrão obrigatório enquanto o contrato oficial do provedor não for homologado. */
export const failClosedWebhookAuthenticator: ProviderWebhookAuthenticator = {
  authenticate: async () => ({ kind: 'REJECTED', reason: 'NOT_CONFIGURED' }),
};

const providerOpaqueIdSchema = z.string().trim().min(1).max(128);

const baseNormalizedEvent = {
  /** Id estável oficial da entrega, quando o contrato do provedor o garante. */
  providerEventId: providerOpaqueIdSchema.nullable(),
  /** Referência opaca da chamada no provedor; NUNCA identifica o tenant. */
  providerCallReference: providerOpaqueIdSchema,
  occurredAt: z.string().datetime(),
};

export const CALL_STATUS_SIGNALS = ['ACCEPTED', 'REJECTED', 'CLOSED'] as const;

export const normalizedProviderEventSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('CALL_STATUS'),
      ...baseNormalizedEvent,
      status: z.enum(CALL_STATUS_SIGNALS),
      rejectionReason: originationRejectionReasonSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('TOOL_INVOCATION'),
      ...baseNormalizedEvent,
      toolName: z.string().trim().min(1).max(64),
      invocationId: providerOpaqueIdSchema,
      arguments: z.unknown(),
    })
    .strict(),
  /**
   * DEC-077 — relatório PÓS-CHAMADA do motor conversacional (histórico,
   * chamadas de função, fim). Um por chamada; o tenant e a sessão vêm da
   * tentativa resolvida no servidor, nunca do relatório.
   */
  z
    .object({
      kind: z.literal('SESSION_REPORT'),
      ...baseNormalizedEvent,
      report: postCallReportSchema,
    })
    .strict(),
]);

export type NormalizedProviderEvent = z.infer<typeof normalizedProviderEventSchema>;
export type NormalizedCallStatusEvent = Extract<NormalizedProviderEvent, { kind: 'CALL_STATUS' }>;
export type NormalizedToolInvocationEvent = Extract<
  NormalizedProviderEvent,
  { kind: 'TOOL_INVOCATION' }
>;
export type NormalizedSessionReportEvent = Extract<
  NormalizedProviderEvent,
  { kind: 'SESSION_REPORT' }
>;

/** Tradução do formato do provedor; `null` = entrega ininteligível (quarentena). */
export interface ProviderWebhookNormalizer {
  normalize(request: ProviderWebhookRequest): NormalizedProviderEvent | null;
}

/** Sinal de status → evento de domínio. A FSM da 008-OF1 garante a monotonicidade. */
export function attemptEventTypeForCallStatus(
  status: NormalizedCallStatusEvent['status'],
): OutboundAttemptEventType {
  if (status === 'ACCEPTED') return 'ORIGINATION_ACCEPTED';
  if (status === 'REJECTED') return 'ORIGINATION_REJECTED';
  return 'CALL_CLOSED_CONFIRMED';
}

/**
 * Chave de deduplicação da entrega. Com id oficial: provedor + referência + id. Sem ele:
 * composição determinística provedor + referência + tipo de transição (uma
 * transição por tipo e tentativa; repetições são a mesma entrega).
 */
export function providerDeliveryKey(provider: string, event: NormalizedProviderEvent): string {
  // Id oficial escopado pela referência: provedores podem reutilizar ids entre chamadas.
  if (event.providerEventId) {
    return `${provider}|id|${event.providerCallReference}|${event.providerEventId}`;
  }
  const transition =
    event.kind === 'CALL_STATUS'
      ? event.status
      : event.kind === 'TOOL_INVOCATION'
        ? `TOOL:${event.invocationId}`
        : 'SESSION_REPORT';
  return `${provider}|ref|${event.providerCallReference}|${transition}`;
}
