import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import { TenantApiClient } from '../../../../../lib/api/tenant-api-client.js';
import { getServerOrganizationContext } from '../../../../../lib/organization/server-organization-context.js';
import { loadAgentDetailData, loadAgentSimulatorData } from './load-agent-detail-data.js';
import { resolveVerifiedAgentOrgContext } from './resolve-verified-agent-org-context.js';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('../../../../../lib/api/api-client-factory.js', () => ({
  getInternalApiClient: vi.fn(() => ({})),
}));
vi.mock('../../../../../lib/api/tenant-api-client.js', () => ({ TenantApiClient: vi.fn() }));
vi.mock('../../../../../lib/organization/server-organization-context.js', () => ({
  getServerOrganizationContext: vi.fn(),
}));

const AGENT = 'a0000000-0000-4000-8000-000000000001';
const HOSTILE = [
  'agent-1',
  '../../v1/organizations',
  '..',
  '%2e%2e',
  '%252e',
  'a/b',
  'a\\b',
  `${AGENT}/x`,
];
const ctx = { organizationId: 'org-1', slug: 'active-org', name: 'Org', role: 'ADMIN' } as never;
const request = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(TenantApiClient).mockImplementation(() => ({ request }) as never);
});

describe('agent detail and simulator loaders — hostile agent ids (F1)', () => {
  it('return a neutral not-found result without calling the internal API', async () => {
    for (const agentId of HOSTILE) {
      for (const load of [loadAgentDetailData, loadAgentSimulatorData]) {
        const result = await load(ctx, 'user-1', agentId);
        expect(result).toMatchObject({ agent: null, isNotFound: true, errorMessage: null });
        expect(result.draftConfig).toBeNull();
      }
    }
    expect(request).not.toHaveBeenCalled();
  });

  it('a version id returned by the API outside the contract is never used in a path', async () => {
    request.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith('/versions')) return [{ id: '../../v1/organizations', status: 'DRAFT' }];
      return { id: AGENT, name: 'Agente' };
    });
    const result = await loadAgentDetailData(ctx, 'user-1', AGENT);
    expect(result.isNotFound).toBe(true);
    expect(request.mock.calls.map(([o]) => (o as { path: string }).path)).toEqual([
      `/v1/agents/${AGENT}`,
      `/v1/agents/${AGENT}/versions`,
    ]);
  });
});

describe('canonical organization redirect — hostile agent ids (F1)', () => {
  it('never echoes an id outside the contract and keeps valid ids', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValue({
      status: 'RESOLVED',
      context: ctx,
      user: { id: 'user-1' },
      availableOrganizations: [],
    } as never);
    for (const agentId of HOSTILE) {
      await resolveVerifiedAgentOrgContext('other-org', agentId, '/simulador');
      expect(redirect).toHaveBeenLastCalledWith('/orgs/active-org/agents');
    }
    await resolveVerifiedAgentOrgContext('other-org', AGENT, '/simulador');
    expect(redirect).toHaveBeenLastCalledWith(`/orgs/active-org/agents/${AGENT}/simulador`);
  });
});
