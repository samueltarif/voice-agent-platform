import { catalogCurrencySchema } from '../catalog/catalog-item-contracts.js';
import {
  DISCOUNT_BASIS_POINTS_MAX,
  discountEvaluationInputSchema,
  type DiscountEvaluation,
  type DiscountRejected,
  type DiscountRejectionReason,
} from './discount-evaluation-contracts.js';

/**
 * AS1b-1 — Avaliador puro e determinístico de UM pedido de desconto sobre o
 * preço de tabela de UM item. Sem banco, rede, arquivos, relógio, modelo ou
 * fornecedor; não altera a entrada. Nunca reduz o pedido ao teto (D4).
 */
type Parsed = ReturnType<typeof discountEvaluationInputSchema.parse>;

const reject = (reason: DiscountRejectionReason): DiscountRejected => ({
  kind: 'REJECTED',
  reason,
});

const isBasisPoints = (value: unknown): value is number =>
  Number.isSafeInteger(value) &&
  (value as number) >= 0 &&
  (value as number) <= DISCOUNT_BASIS_POINTS_MAX;

/** D3: percentual com no máximo 2 casas decimais, convertido sem arredondar. */
export function percentToBasisPoints(percent: unknown): number | null {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return null;
  if (percent < 0 || percent > 100) return null;
  const basisPoints = Math.round(percent * 100);
  return basisPoints / 100 === percent ? basisPoints : null;
}

function checkScope(input: Parsed): DiscountRejected | null {
  if (input.agentVersion.organizationId !== input.sessionOrganizationId)
    return reject('VERSION_TENANT_MISMATCH');
  if (input.catalogItem.organizationId !== input.sessionOrganizationId)
    return reject('ITEM_TENANT_MISMATCH');
  if (input.agentVersion.status !== 'PUBLISHED') return reject('VERSION_NOT_PUBLISHED');
  return null;
}

function resolveLimit(input: Parsed): number | DiscountRejected {
  const raw = input.agentVersion.maxDiscountPercent;
  if (raw === undefined || raw === null) return reject('NO_DISCOUNT_POLICY');
  return percentToBasisPoints(raw) ?? reject('INVALID_POLICY');
}

function resolvePrice(input: Parsed): number | DiscountRejected {
  const item = input.catalogItem;
  if (!item.active) return reject('ITEM_INACTIVE');
  if (!catalogCurrencySchema.safeParse(item.currency).success) return reject('INVALID_CURRENCY');
  if (item.priceCents === undefined || item.priceCents === null) return reject('PRICE_UNAVAILABLE');
  if (!Number.isSafeInteger(item.priceCents) || (item.priceCents as number) < 0)
    return reject('INVALID_PRICE');
  return item.priceCents as number;
}

/** D3: preço final = original − piso(original × pb / 10.000), com BigInt. */
export function discountCentsFor(priceCents: number, basisPoints: number): number {
  return Number((BigInt(priceCents) * BigInt(basisPoints)) / BigInt(DISCOUNT_BASIS_POINTS_MAX));
}

/** Preço zero = item gratuito: só o pedido de 0 pb é aceito (não é desconto). */
function checkAmount(price: number, requested: number, limit: number): DiscountRejected | null {
  if (price === 0 && requested > 0) return reject('FREE_ITEM_NOT_DISCOUNTABLE');
  if (requested > limit) return reject('ABOVE_LIMIT');
  return null;
}

export function evaluateDiscountRequest(rawInput: unknown): DiscountEvaluation {
  const parsed = discountEvaluationInputSchema.safeParse(rawInput);
  if (!parsed.success) return reject('INVALID_INPUT');
  const input = parsed.data;
  const scope = checkScope(input);
  if (scope) return scope;
  const limit = resolveLimit(input);
  if (typeof limit !== 'number') return limit;
  const requested = input.requestedDiscountBasisPoints;
  if (!isBasisPoints(requested)) return reject('INVALID_REQUEST');
  const price = resolvePrice(input);
  if (typeof price !== 'number') return price;
  const amountCheck = checkAmount(price, requested, limit);
  if (amountCheck) return amountCheck;
  const discountCents = discountCentsFor(price, requested);
  return {
    kind: 'AUTHORIZED',
    organizationId: input.sessionOrganizationId,
    agentVersionId: input.agentVersion.id,
    catalogItemId: input.catalogItem.id,
    currency: input.catalogItem.currency as string,
    originalPriceCents: price,
    discountBasisPoints: requested,
    maxDiscountBasisPoints: limit,
    discountCents,
    finalPriceCents: price - discountCents,
  };
}
