import { z } from 'zod';
import { agentVersionStatusSchema } from '../agents/agent-version-status.js';

/**
 * AS1b-1 — Contrato do avaliador determinístico de desconto (OFFLINE).
 *
 * Decisões do operador (DEC-046): D1 política ausente = nenhum desconto;
 * D2 base = preço de tabela de UM item do catálogo; D3 pontos-base inteiros
 * (0..10.000), no máximo 2 casas decimais no percentual da política, centavos
 * inteiros e preço final arredondado a favor da empresa; D4 acima do teto =
 * recusa integral, sem reduzir o pedido.
 *
 * CONFIANÇA DA ENTRADA: a função pura NÃO comprova a origem dos dados. O futuro
 * chamador do servidor deve preencher organização, versão publicada, política,
 * preço, moeda e status a partir de fontes autoritativas (sessão autenticada,
 * versão publicada e catálogo do tenant), nunca de argumentos do modelo ou da
 * fala do cliente. Só `requestedDiscountBasisPoints` representa o pedido.
 */
export const DISCOUNT_BASIS_POINTS_MAX = 10_000;

const uuid = z.string().uuid();

export const discountEvaluationInputSchema = z
  .object({
    sessionOrganizationId: uuid,
    agentVersion: z
      .object({
        id: uuid,
        organizationId: uuid,
        status: agentVersionStatusSchema,
        /** `rules.deterministic.maxDiscountPercent` da versão; validado à parte. */
        maxDiscountPercent: z.unknown().optional(),
      })
      .strict(),
    catalogItem: z
      .object({
        id: uuid,
        organizationId: uuid,
        active: z.boolean(),
        /** Validado à parte para motivos estáveis (ausente × inválido). */
        priceCents: z.unknown().optional(),
        currency: z.unknown(),
      })
      .strict(),
    /** Pedido em pontos-base inteiros (700 = 7%). */
    requestedDiscountBasisPoints: z.unknown(),
  })
  .strict();

export type DiscountEvaluationInput = z.input<typeof discountEvaluationInputSchema>;

export const DISCOUNT_REJECTION_REASONS = [
  'INVALID_INPUT',
  'VERSION_TENANT_MISMATCH',
  'ITEM_TENANT_MISMATCH',
  'VERSION_NOT_PUBLISHED',
  'NO_DISCOUNT_POLICY',
  'INVALID_POLICY',
  'INVALID_REQUEST',
  'ITEM_INACTIVE',
  'INVALID_CURRENCY',
  'PRICE_UNAVAILABLE',
  'INVALID_PRICE',
  'FREE_ITEM_NOT_DISCOUNTABLE',
  'ABOVE_LIMIT',
] as const;
export type DiscountRejectionReason = (typeof DISCOUNT_REJECTION_REASONS)[number];

export interface DiscountAuthorized {
  readonly kind: 'AUTHORIZED';
  readonly organizationId: string;
  readonly agentVersionId: string;
  readonly catalogItemId: string;
  readonly currency: string;
  readonly originalPriceCents: number;
  readonly discountBasisPoints: number;
  readonly maxDiscountBasisPoints: number;
  readonly discountCents: number;
  readonly finalPriceCents: number;
}

export interface DiscountRejected {
  readonly kind: 'REJECTED';
  readonly reason: DiscountRejectionReason;
}

export type DiscountEvaluation = DiscountAuthorized | DiscountRejected;

/**
 * Categoria segura para quem fala com o cliente final: não distingue recurso
 * inexistente de recurso de outra organização.
 */
export type PublicDiscountOutcome = 'DISCOUNT_NOT_AUTHORIZED' | 'ITEM_UNAVAILABLE';

const ITEM_UNAVAILABLE_REASONS: ReadonlySet<DiscountRejectionReason> = new Set([
  'VERSION_TENANT_MISMATCH',
  'ITEM_TENANT_MISMATCH',
  'VERSION_NOT_PUBLISHED',
  'ITEM_INACTIVE',
  'INVALID_CURRENCY',
  'PRICE_UNAVAILABLE',
  'INVALID_PRICE',
  'INVALID_INPUT',
]);

export function toPublicDiscountOutcome(reason: DiscountRejectionReason): PublicDiscountOutcome {
  return ITEM_UNAVAILABLE_REASONS.has(reason) ? 'ITEM_UNAVAILABLE' : 'DISCOUNT_NOT_AUTHORIZED';
}
