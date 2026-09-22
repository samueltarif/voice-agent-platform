export interface MockPlatformOverview {
  readonly totalOrganizations: number;
  readonly activeSubscriptions: number;
  readonly minutesConsumed: number;
  readonly providerCostCents: number;
}

export interface MockPlatformTenant {
  readonly id: string;
  readonly name: string;
  readonly plan: string;
  readonly status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED';
  readonly minutesUsed: number;
  readonly monthlySpendCents: number;
}

export const PLATFORM_ADMIN_DISCLAIMER =
  'UI Preview — autorização de Platform Admin será implementada na fase de autenticação.' as const;

export const MOCK_PLATFORM_OVERVIEW: MockPlatformOverview = {
  totalOrganizations: 14,
  activeSubscriptions: 12,
  minutesConsumed: 4820,
  providerCostCents: 41250,
};

export const MOCK_PLATFORM_TENANTS: readonly MockPlatformTenant[] = [
  {
    id: 'org-01',
    name: 'Atlas Equipamentos',
    plan: 'Enterprise',
    status: 'ACTIVE',
    minutesUsed: 1240,
    monthlySpendCents: 11200,
  },
  {
    id: 'org-02',
    name: 'Metal Prime',
    plan: 'Growth',
    status: 'ACTIVE',
    minutesUsed: 890,
    monthlySpendCents: 7800,
  },
  {
    id: 'org-03',
    name: 'Clínica Vita',
    plan: 'Starter',
    status: 'TRIAL',
    minutesUsed: 310,
    monthlySpendCents: 2400,
  },
  {
    id: 'org-04',
    name: 'Indústrias SP',
    plan: 'Growth',
    status: 'ACTIVE',
    minutesUsed: 1420,
    monthlySpendCents: 12800,
  },
];
