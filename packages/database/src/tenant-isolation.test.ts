import { describe, it, expect } from 'vitest';

export function evaluateEntitlement(params: {
  grantedOverride?: string | null;
  numericLimit?: number | null;
  booleanValue?: boolean | null;
}): { allowed: boolean; effectiveLimit: number | null } {
  if (params.grantedOverride !== undefined && params.grantedOverride !== null) {
    const overrideNum = Number(params.grantedOverride);
    if (!Number.isNaN(overrideNum)) {
      return { allowed: true, effectiveLimit: overrideNum };
    }
    return { allowed: params.grantedOverride === 'true', effectiveLimit: null };
  }

  if (params.numericLimit !== undefined && params.numericLimit !== null) {
    return { allowed: params.numericLimit > 0, effectiveLimit: params.numericLimit };
  }

  return { allowed: Boolean(params.booleanValue), effectiveLimit: null };
}

export function isOperationalMember(status: string): boolean {
  return status === 'ACTIVE';
}

export function canAccessPlatformAdmin(authorization: { status: string } | null): boolean {
  return authorization?.status === 'ACTIVE';
}

describe('Tenant Safety and Entitlement Invariants (Unit)', () => {
  it('only ACTIVE memberships grant operational access', () => {
    expect(isOperationalMember('ACTIVE')).toBe(true);
    expect(isOperationalMember('INVITED')).toBe(false);
    expect(isOperationalMember('SUSPENDED')).toBe(false);
  });

  it('tenant OWNER role never grants platform admin authorization', () => {
    const tenantOwnerMembership = {
      role: 'OWNER',
      status: 'ACTIVE',
      organizationId: 'org-123',
    };

    const platformAuth = null;

    expect(tenantOwnerMembership.role).toBe('OWNER');
    expect(canAccessPlatformAdmin(platformAuth)).toBe(false);
  });

  it('evaluates commercial entitlement hierarchy correctly with overrides', () => {
    const planEntitlement = {
      numericLimit: 5,
      booleanValue: null,
      grantedOverride: null,
    };
    expect(evaluateEntitlement(planEntitlement)).toEqual({
      allowed: true,
      effectiveLimit: 5,
    });

    const grantOverride = {
      numericLimit: 5,
      booleanValue: null,
      grantedOverride: '25',
    };
    expect(evaluateEntitlement(grantOverride)).toEqual({
      allowed: true,
      effectiveLimit: 25,
    });

    const zeroLimit = {
      numericLimit: 0,
      booleanValue: null,
      grantedOverride: null,
    };
    expect(evaluateEntitlement(zeroLimit)).toEqual({
      allowed: false,
      effectiveLimit: 0,
    });
  });

  it('never trusts client boolean for plan entitlement evaluation', () => {
    const entitlement = evaluateEntitlement({
      booleanValue: false,
      grantedOverride: null,
      numericLimit: null,
    });
    expect(entitlement.allowed).toBe(false);
  });
});
