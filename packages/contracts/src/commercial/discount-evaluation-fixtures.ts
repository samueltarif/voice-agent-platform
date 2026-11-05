import type { DiscountEvaluationInput } from './discount-evaluation-contracts.js';

export const ORG_A = '11111111-1111-4111-8111-111111111111';
export const ORG_B = '22222222-2222-4222-8222-222222222222';
export const VERSION_A = '33333333-3333-4333-8333-333333333333';
export const ITEM_A = '44444444-4444-4444-8444-444444444444';

interface InputOverrides {
  readonly sessionOrganizationId?: string;
  readonly agentVersion?: Partial<DiscountEvaluationInput['agentVersion']>;
  readonly catalogItem?: Partial<DiscountEvaluationInput['catalogItem']>;
  readonly requestedDiscountBasisPoints?: unknown;
}

/** Entrada sintética (sem dados reais): versão publicada com teto de 10%, item de R$ 100,00. */
export function discountInput(overrides: InputOverrides = {}): DiscountEvaluationInput {
  return {
    sessionOrganizationId: overrides.sessionOrganizationId ?? ORG_A,
    agentVersion: {
      id: VERSION_A,
      organizationId: ORG_A,
      status: 'PUBLISHED',
      maxDiscountPercent: 10,
      ...overrides.agentVersion,
    },
    catalogItem: {
      id: ITEM_A,
      organizationId: ORG_A,
      active: true,
      priceCents: 10_000,
      currency: 'BRL',
      ...overrides.catalogItem,
    },
    requestedDiscountBasisPoints:
      'requestedDiscountBasisPoints' in overrides ? overrides.requestedDiscountBasisPoints : 500,
  };
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
