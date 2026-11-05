import { describe, expect, it } from 'vitest';
import { discountInput, ITEM_A, ORG_A, VERSION_A } from './discount-evaluation-fixtures.js';
import { toPublicDiscountOutcome } from './discount-evaluation-contracts.js';
import { evaluateDiscountRequest, percentToBasisPoints } from './evaluate-discount-request.js';

const evaluate = (overrides: Parameters<typeof discountInput>[0] = {}) =>
  evaluateDiscountRequest(discountInput(overrides));
const reason = (overrides: Parameters<typeof discountInput>[0]) => {
  const result = evaluate(overrides);
  return result.kind === 'REJECTED' ? result.reason : 'AUTHORIZED';
};

describe('evaluateDiscountRequest — limits (D1, D3, D4)', () => {
  it('authorizes a request within the limit with full metadata', () => {
    expect(evaluate()).toEqual({
      kind: 'AUTHORIZED',
      organizationId: ORG_A,
      agentVersionId: VERSION_A,
      catalogItemId: ITEM_A,
      currency: 'BRL',
      originalPriceCents: 10_000,
      discountBasisPoints: 500,
      maxDiscountBasisPoints: 1_000,
      discountCents: 500,
      finalPriceCents: 9_500,
    });
  });

  it('authorizes exactly at the limit and rejects one basis point above, never reducing it', () => {
    expect(evaluate({ requestedDiscountBasisPoints: 1_000 }).kind).toBe('AUTHORIZED');
    expect(evaluate({ requestedDiscountBasisPoints: 1_001 })).toEqual({
      kind: 'REJECTED',
      reason: 'ABOVE_LIMIT',
    });
  });

  it('handles 0% and 100% policies', () => {
    const zero = { agentVersion: { maxDiscountPercent: 0 } };
    expect(reason({ ...zero, requestedDiscountBasisPoints: 1 })).toBe('ABOVE_LIMIT');
    expect(evaluate({ ...zero, requestedDiscountBasisPoints: 0 })).toMatchObject({
      kind: 'AUTHORIZED',
      discountCents: 0,
      finalPriceCents: 10_000,
    });
    const full = evaluate({
      agentVersion: { maxDiscountPercent: 100 },
      requestedDiscountBasisPoints: 10_000,
    });
    expect(full).toMatchObject({ kind: 'AUTHORIZED', discountCents: 10_000, finalPriceCents: 0 });
  });

  it('converts fractional policies with up to two decimals and rejects excess precision', () => {
    expect(percentToBasisPoints(7)).toBe(700);
    expect(percentToBasisPoints(7.5)).toBe(750);
    expect(percentToBasisPoints(7.55)).toBe(755);
    expect(percentToBasisPoints(0.01)).toBe(1);
    for (const bad of [7.555, 0.001, 33.333, 100.01, -0.01, NaN, Infinity, '10', null]) {
      expect(percentToBasisPoints(bad)).toBeNull();
    }
    expect(
      reason({ agentVersion: { maxDiscountPercent: 7.55 }, requestedDiscountBasisPoints: 755 }),
    ).toBe('AUTHORIZED');
    expect(
      reason({ agentVersion: { maxDiscountPercent: 7.55 }, requestedDiscountBasisPoints: 756 }),
    ).toBe('ABOVE_LIMIT');
    expect(reason({ agentVersion: { maxDiscountPercent: 7.555 } })).toBe('INVALID_POLICY');
  });

  it('treats a missing policy as no discount authorized (D1), even for 0 bp', () => {
    expect(reason({ agentVersion: { maxDiscountPercent: undefined } })).toBe('NO_DISCOUNT_POLICY');
    expect(reason({ agentVersion: { maxDiscountPercent: null } })).toBe('NO_DISCOUNT_POLICY');
    const { maxDiscountPercent: _m, ...withoutKey } = discountInput().agentVersion;
    expect(evaluateDiscountRequest({ ...discountInput(), agentVersion: withoutKey })).toEqual({
      kind: 'REJECTED',
      reason: 'NO_DISCOUNT_POLICY',
    });
    expect(
      reason({ agentVersion: { maxDiscountPercent: undefined }, requestedDiscountBasisPoints: 0 }),
    ).toBe('NO_DISCOUNT_POLICY');
    for (const bad of [-1, 101, NaN, Infinity, '10', '', true, {}]) {
      expect(reason({ agentVersion: { maxDiscountPercent: bad } })).toBe('INVALID_POLICY');
    }
  });
});

describe('evaluateDiscountRequest — rounding and money', () => {
  it('rounds the final price in favor of the company (floor on the discount)', () => {
    const one = { catalogItem: { priceCents: 1 }, requestedDiscountBasisPoints: 1_000 };
    expect(evaluate(one)).toMatchObject({ discountCents: 0, finalPriceCents: 1 });
    const odd = { catalogItem: { priceCents: 999 }, requestedDiscountBasisPoints: 755 };
    expect(evaluate({ ...odd, agentVersion: { maxDiscountPercent: 7.55 } })).toMatchObject({
      discountCents: 75,
      finalPriceCents: 924,
    });
    const tiny = { catalogItem: { priceCents: 9_999 }, requestedDiscountBasisPoints: 1 };
    expect(evaluate(tiny)).toMatchObject({ discountCents: 0, finalPriceCents: 9_999 });
  });

  it('uses exact integer math for large prices and rejects unsafe values', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const big = evaluate({
      agentVersion: { maxDiscountPercent: 100 },
      catalogItem: { priceCents: max },
      requestedDiscountBasisPoints: 9_999,
    });
    const expected = Number((BigInt(max) * 9_999n) / 10_000n);
    expect(big).toMatchObject({ discountCents: expected, finalPriceCents: max - expected });
    for (const priceCents of [max + 1, 2 ** 60, -1, 10.5, NaN, Infinity, '100', true]) {
      expect(reason({ catalogItem: { priceCents } })).toBe('INVALID_PRICE');
    }
    expect(reason({ catalogItem: { priceCents: null } })).toBe('PRICE_UNAVAILABLE');
    expect(reason({ catalogItem: { priceCents: undefined } })).toBe('PRICE_UNAVAILABLE');
  });

  it('distinguishes a free item from a commercial discount', () => {
    expect(
      evaluate({ catalogItem: { priceCents: 0 }, requestedDiscountBasisPoints: 0 }),
    ).toMatchObject({
      kind: 'AUTHORIZED',
      originalPriceCents: 0,
      discountCents: 0,
      finalPriceCents: 0,
    });
    expect(reason({ catalogItem: { priceCents: 0 }, requestedDiscountBasisPoints: 1 })).toBe(
      'FREE_ITEM_NOT_DISCOUNTABLE',
    );
  });

  it('maps internal reasons to a public outcome that never reveals other tenants', () => {
    expect(toPublicDiscountOutcome('ITEM_TENANT_MISMATCH')).toBe('ITEM_UNAVAILABLE');
    expect(toPublicDiscountOutcome('VERSION_TENANT_MISMATCH')).toBe('ITEM_UNAVAILABLE');
    expect(toPublicDiscountOutcome('PRICE_UNAVAILABLE')).toBe('ITEM_UNAVAILABLE');
    expect(toPublicDiscountOutcome('ABOVE_LIMIT')).toBe('DISCOUNT_NOT_AUTHORIZED');
    expect(toPublicDiscountOutcome('NO_DISCOUNT_POLICY')).toBe('DISCOUNT_NOT_AUTHORIZED');
  });
});
