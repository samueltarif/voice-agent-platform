import { describe, it, expect, vi } from 'vitest';
import type { OrganizationContextResponse } from '@voice-agent/contracts';
import type { BootstrapApiClient } from '../api/bootstrap-api-client.js';
import { ActiveOrganizationContextResolver } from './active-organization-context-resolver.js';

function createMockBootstrapClient(
  organizations: OrganizationContextResponse[] = [],
): BootstrapApiClient {
  return {
    listOrganizationsForUser: vi.fn().mockResolvedValue(organizations),
    getOrganizationBySlug: vi.fn(),
  } as unknown as BootstrapApiClient;
}

const ORG_A: OrganizationContextResponse = {
  id: 'a0000000-0000-0000-0000-000000000001',
  slug: 'acme-corp',
  name: 'Acme Corporation',
  role: 'ADMIN',
};

const ORG_B: OrganizationContextResponse = {
  id: 'b0000000-0000-0000-0000-000000000002',
  slug: 'globex-inc',
  name: 'Globex Inc',
  role: 'VIEWER',
};

describe('ActiveOrganizationContextResolver', () => {
  const resolver = new ActiveOrganizationContextResolver();

  it('returns UNAUTHENTICATED when userId is missing or empty', async () => {
    const client = createMockBootstrapClient();
    const resultNoUser = await resolver.resolve({
      userId: null,
      bootstrapClient: client,
    });
    expect(resultNoUser.status).toBe('UNAUTHENTICATED');
    expect(resultNoUser.context).toBeUndefined();
    expect(resultNoUser.availableOrganizations).toEqual([]);

    const resultEmpty = await resolver.resolve({
      userId: '   ',
      bootstrapClient: client,
    });
    expect(resultEmpty.status).toBe('UNAUTHENTICATED');
  });

  it('returns NO_ORGANIZATIONS when user has no active organizations', async () => {
    const client = createMockBootstrapClient([]);
    const result = await resolver.resolve({
      userId: 'user-without-orgs',
      bootstrapClient: client,
    });
    expect(result.status).toBe('NO_ORGANIZATIONS');
    expect(result.context).toBeUndefined();
    expect(result.availableOrganizations).toEqual([]);
  });

  it('automatically selects the single active organization when exactly one is available', async () => {
    const client = createMockBootstrapClient([ORG_A]);
    const result = await resolver.resolve({
      userId: 'user-single-org',
      bootstrapClient: client,
    });
    expect(result.status).toBe('RESOLVED');
    expect(result.context).toEqual({
      organizationId: ORG_A.id,
      slug: ORG_A.slug,
      name: ORG_A.name,
      role: 'ADMIN',
    });
    expect(result.availableOrganizations).toHaveLength(1);
    expect(result.stalePreferenceDetected).toBeUndefined();
  });

  it('resolves preferred organization when preference matches an authorized active organization', async () => {
    const client = createMockBootstrapClient([ORG_A, ORG_B]);
    const result = await resolver.resolve({
      userId: 'user-multi-org',
      preferredSlug: 'globex-inc',
      bootstrapClient: client,
    });
    expect(result.status).toBe('RESOLVED');
    expect(result.context).toEqual({
      organizationId: ORG_B.id,
      slug: ORG_B.slug,
      name: ORG_B.name,
      role: 'VIEWER',
    });
    expect(result.stalePreferenceDetected).toBeUndefined();
  });

  it('safely falls back to first authorized organization when preference is stale or unknown', async () => {
    const client = createMockBootstrapClient([ORG_A, ORG_B]);
    const result = await resolver.resolve({
      userId: 'user-multi-org',
      preferredSlug: 'revoked-or-tampered-org',
      bootstrapClient: client,
    });
    expect(result.status).toBe('RESOLVED');
    expect(result.context).toEqual({
      organizationId: ORG_A.id,
      slug: ORG_A.slug,
      name: ORG_A.name,
      role: 'ADMIN',
    });
    expect(result.stalePreferenceDetected).toBe(true);
  });

  it('safely falls back when membership was revoked and preferred org is no longer returned', async () => {
    // User had preferred ORG_B in cookie, but membership in ORG_B was revoked
    // API now only returns ORG_A
    const client = createMockBootstrapClient([ORG_A]);
    const result = await resolver.resolve({
      userId: 'user-membership-revoked',
      preferredSlug: 'globex-inc',
      bootstrapClient: client,
    });
    expect(result.status).toBe('RESOLVED');
    expect(result.context?.slug).toBe('acme-corp');
    expect(result.context?.organizationId).toBe(ORG_A.id);
    expect(result.stalePreferenceDetected).toBe(true);
  });

  it('reflects updated role from backend immediately on resolution', async () => {
    const updatedOrgA: OrganizationContextResponse = {
      ...ORG_A,
      role: 'OWNER',
    };
    const client = createMockBootstrapClient([updatedOrgA]);
    const result = await resolver.resolve({
      userId: 'user-promoted',
      bootstrapClient: client,
    });
    expect(result.context?.role).toBe('OWNER');
  });

  it('never trusts client organizationId or role: strictly derives them from backend response', async () => {
    const client = createMockBootstrapClient([ORG_B]);
    const result = await resolver.resolve({
      userId: 'user-strict-boundary',
      preferredSlug: 'globex-inc',
      bootstrapClient: client,
    });
    // Context must match the backend object, not any caller parameters
    expect(result.context?.organizationId).toBe(ORG_B.id);
    expect(result.context?.role).toBe(ORG_B.role);
  });
});
