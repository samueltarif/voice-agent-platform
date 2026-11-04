import { z } from 'zod';

/**
 * 008-OF5a (S1) — Sessão conversacional preparada ANTES da perna telefônica
 * existir (DEC-045). Contrato provider-neutral: nenhum campo, endpoint ou
 * formato de fornecedor; o adaptador mapeia apenas o que estiver documentado.
 *
 * A sessão preparada é representada pela sessão de chamada no estado existente
 * `CREATED` (D-S1-SESSION-STATE = a); este contrato descreve só a preparação.
 */

/** Referência opaca da sessão no motor conversacional (nunca identifica o tenant). */
export const conversationSessionRefSchema = z.string().trim().min(1).max(128);

/** Destino de mídia: SIP primeiro; *stream* bidirecional como alternativa. */
export const mediaTargetSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('SIP_URI'),
      uri: z
        .string()
        .trim()
        .max(255)
        .regex(/^sips?:[^\s]+@[^\s]+$/i, 'SIP URI inválida'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('BIDIRECTIONAL_AUDIO_STREAM'),
      url: z
        .string()
        .trim()
        .max(2048)
        .regex(/^wss:\/\/[^\s]+$/i, 'Stream de áudio exige wss://'),
    })
    .strict(),
]);
export type MediaTarget = z.infer<typeof mediaTargetSchema>;

export const conversationSessionPreparationRequestSchema = z
  .object({
    organizationId: z.string().uuid(),
    attemptId: z.string().uuid(),
    correlationId: z.string().uuid(),
    /** Versão publicada (imutável) do agente: a configuração vem dela, no servidor. */
    agentVersionId: z.string().uuid(),
  })
  .strict();
export type ConversationSessionPreparationRequest = z.infer<
  typeof conversationSessionPreparationRequestSchema
>;

export const CONVERSATION_SESSION_UNAVAILABLE_REASONS = [
  'PROVIDER_DOWN',
  'TIMEOUT',
  'REJECTED',
] as const;

export const conversationSessionPreparationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('PREPARED'),
      sessionRef: conversationSessionRefSchema,
      mediaTarget: mediaTargetSchema,
      /** `null` = validade desconhecida (o fornecedor não a documenta). */
      expiresAt: z.string().datetime().nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('UNAVAILABLE'),
      reason: z.enum(CONVERSATION_SESSION_UNAVAILABLE_REASONS),
    })
    .strict(),
]);
export type ConversationSessionPreparation = z.infer<typeof conversationSessionPreparationSchema>;

export interface ConversationSessionRef {
  readonly organizationId: string;
  readonly sessionRef: string;
}

export type ConversationSessionTermination = 'TERMINATED' | 'NOT_FOUND' | 'UNKNOWN';
export type ConversationSessionStatus = 'ACTIVE' | 'ENDED' | 'NOT_FOUND' | 'UNKNOWN';

/** Porta do motor conversacional. Implementações reais: `PROVIDER-UNVERIFIED`. */
export interface ConversationSessionPort {
  prepare(request: ConversationSessionPreparationRequest): Promise<ConversationSessionPreparation>;
  terminate(ref: ConversationSessionRef): Promise<ConversationSessionTermination>;
  getStatus(ref: ConversationSessionRef): Promise<ConversationSessionStatus>;
}

export type PreparationValidity = 'VALID' | 'EXPIRED' | 'UNKNOWN';

/**
 * Validade de uma preparação no instante `now`. Validade desconhecida nunca é
 * tratada como válida: a orquestração (S4) decide o que fazer com `UNKNOWN`.
 */
export function evaluatePreparationValidity(
  preparation: Extract<ConversationSessionPreparation, { kind: 'PREPARED' }>,
  now: Date,
): PreparationValidity {
  if (preparation.expiresAt === null) return 'UNKNOWN';
  return Date.parse(preparation.expiresAt) > now.getTime() ? 'VALID' : 'EXPIRED';
}
