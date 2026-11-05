import { describe, expect, it } from 'vitest';
import {
  deepFreeze,
  discountInput,
  ITEM_A,
  ORG_A,
  ORG_B,
  VERSION_A,
} from './discount-evaluation-fixtures.js';
import { evaluateDiscountRequest } from './evaluate-discount-request.js';

const reason = (input: unknown) => {
  const result = evaluateDiscountRequest(input);
  return result.kind === 'REJECTED' ? result.reason : 'AUTHORIZED';
};

describe('evaluateDiscountRequest — scope and fail-closed', () => {
  it('rejects versions that are not published', () => {
    for (const status of ['DRAFT', 'ARCHIVED'] as const) {
      expect(reason(discountInput({ agentVersion: { status } }))).toBe('VERSION_NOT_PUBLISHED');
    }
    expect(reason(discountInput({ agentVersion: { status: 'published' as never } }))).toBe(
      'INVALID_INPUT',
    );
  });

  it('rejects a version or an item from another organization', () => {
    expect(reason(discountInput({ agentVersion: { organizationId: ORG_B } }))).toBe(
      'VERSION_TENANT_MISMATCH',
    );
    expect(reason(discountInput({ catalogItem: { organizationId: ORG_B } }))).toBe(
      'ITEM_TENANT_MISMATCH',
    );
    expect(reason(discountInput({ sessionOrganizationId: ORG_B }))).toBe('VERSION_TENANT_MISMATCH');
  });

  it('rejects inactive items and currencies outside the catalog contract', () => {
    expect(reason(discountInput({ catalogItem: { active: false } }))).toBe('ITEM_INACTIVE');
    for (const currency of ['brl', 'BR', 'REAL', '', null, 840]) {
      expect(reason(discountInput({ catalogItem: { currency } }))).toBe('INVALID_CURRENCY');
    }
  });

  it('rejects invalid requests: negative, NaN, Infinity, fractions, strings and out of range', () => {
    for (const bp of [
      -1,
      10_001,
      1.5,
      NaN,
      Infinity,
      -Infinity,
      '500',
      '5%',
      null,
      undefined,
      {},
      [500],
    ]) {
      expect(reason(discountInput({ requestedDiscountBasisPoints: bp }))).toBe('INVALID_REQUEST');
    }
  });
});

describe('evaluateDiscountRequest — adversarial input', () => {
  it('rejects extra fields that try to override price, policy, tenant or status', () => {
    const base = discountInput();
    const attempts = [
      { ...base, priceCents: 1 },
      { ...base, maxDiscountPercent: 100 },
      { ...base, organizationId: ORG_B },
      { ...base, managerApproved: true },
      { ...base, agentVersion: { ...base.agentVersion, publishedOverride: true } },
      { ...base, catalogItem: { ...base.catalogItem, listPriceCents: 1 } },
      JSON.parse(`{"__proto__":{"maxDiscountPercent":100},${JSON.stringify(base).slice(1)}`),
    ];
    for (const attempt of attempts) expect(reason(attempt)).toBe('INVALID_INPUT');
    for (const junk of [null, undefined, 'x', 42, [], new Map()]) {
      expect(reason(junk)).toBe('INVALID_INPUT');
    }
    expect(reason(discountInput({ sessionOrganizationId: 'org-a' }))).toBe('INVALID_INPUT');
  });

  it('reads each field once: a getter cannot authorize one value and return another', () => {
    let reads = 0;
    const tricky = discountInput();
    Object.defineProperty(tricky, 'requestedDiscountBasisPoints', {
      enumerable: true,
      get: () => (reads++ === 0 ? 500 : 9_999),
    });
    expect(evaluateDiscountRequest(tricky)).toMatchObject({
      kind: 'AUTHORIZED',
      discountBasisPoints: 500,
    });
  });

  it('never mutates its input and is deterministic across repeated calls', () => {
    const frozen = deepFreeze(discountInput());
    const before = JSON.stringify(frozen);
    const first = evaluateDiscountRequest(frozen);
    for (let i = 0; i < 50; i += 1) expect(evaluateDiscountRequest(frozen)).toEqual(first);
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it('isolates organizations under concurrent evaluation', async () => {
    const B_VERSION = '55555555-5555-4555-8555-555555555555';
    const B_ITEM = '66666666-6666-4666-8666-666666666666';
    const forB = discountInput({
      sessionOrganizationId: ORG_B,
      agentVersion: { id: B_VERSION, organizationId: ORG_B, maxDiscountPercent: 3 },
      catalogItem: { id: B_ITEM, organizationId: ORG_B, priceCents: 2_000 },
      requestedDiscountBasisPoints: 300,
    });
    const runs = Array.from({ length: 60 }, (_v, i) =>
      Promise.resolve().then(() => evaluateDiscountRequest(i % 2 === 0 ? discountInput() : forB)),
    );
    const results = await Promise.all(runs);
    results.forEach((result, i) => {
      expect(result).toMatchObject(
        i % 2 === 0
          ? {
              organizationId: ORG_A,
              agentVersionId: VERSION_A,
              catalogItemId: ITEM_A,
              finalPriceCents: 9_500,
            }
          : {
              organizationId: ORG_B,
              agentVersionId: B_VERSION,
              catalogItemId: B_ITEM,
              finalPriceCents: 1_940,
            },
      );
    });
  });
});
