import { z } from 'zod';

/**
 * Motivos de supressão registrados pelo TENANT. Nenhum motivo implica regra
 * legal presumida: a origem (pedido do titular, cadastro externo de "não
 * perturbe", decisão interna) é declarada por quem registra, com referência
 * opcional de evidência. Supressão é sempre fail-closed: na dúvida, não ligar.
 */
export const CONTACT_SUPPRESSION_REASONS = ['OPT_OUT', 'DO_NOT_CALL_REGISTRY', 'MANUAL'] as const;
export const contactSuppressionReasonSchema = z.enum(CONTACT_SUPPRESSION_REASONS);
export type ContactSuppressionReason = z.infer<typeof contactSuppressionReasonSchema>;

export const createContactSuppressionInputSchema = z
  .object({
    phone: z.string().trim().min(1).max(32),
    reason: contactSuppressionReasonSchema,
    /** Referência opaca de evidência (protocolo, ticket); nunca dado sensível bruto. */
    evidenceReference: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type CreateContactSuppressionInput = z.infer<typeof createContactSuppressionInputSchema>;

export const createContactListInputSchema = z
  .object({ name: z.string().trim().min(1).max(120) })
  .strict();
export type CreateContactListInput = z.infer<typeof createContactListInputSchema>;
