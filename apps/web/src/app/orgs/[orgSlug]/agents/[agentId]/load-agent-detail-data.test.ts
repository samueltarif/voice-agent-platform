import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAgentDetailData } from './load-agent-detail-data.js';
import { TenantApiClient } from '../../../../../lib/api/tenant-api-client.js';
import type { ActiveOrganizationContext } from '../../../../../lib/organization/active-organization-context.js';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from '../../../../../features/agents/agent-default-configuration.js';

vi.mock('../../../../../lib/api/api-client-factory.js', () => ({
  getInternalApiClient: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../../../lib/api/tenant-api-client.js', () => {
  return {
    TenantApiClient: vi.fn(),
  };
});

const CONTEXT_ADMIN: ActiveOrganizationContext = {
  organizationId: 'org-1',
  slug: 'test-org',
  name: 'Test Org',
  role: 'ADMIN',
};

const CONTEXT_VIEWER: ActiveOrganizationContext = {
  organizationId: 'org-1',
  slug: 'test-org',
  name: 'Test Org',
  role: 'VIEWER',
};

describe('loadAgentDetailData', () => {
  let mockRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = vi.fn();
    vi.mocked(TenantApiClient).mockImplementation(
      () =>
        ({
          request: mockRequest,
        }) as unknown as TenantApiClient,
    );
  });

  it('loads agent, versions and draft configuration when user has ADMIN role and draft exists', async () => {
    mockRequest.mockImplementation(({ path }: { path: string }) => {
      if (path === '/v1/agents/agent-1') {
        return Promise.resolve({ id: 'agent-1', name: 'Agent 1' });
      }
      if (path === '/v1/agents/agent-1/versions') {
        return Promise.resolve([
          { id: 'ver-1', versionNumber: 1, status: 'PUBLISHED' },
          { id: 'ver-2', versionNumber: 2, status: 'DRAFT' },
        ]);
      }
      if (path === '/v1/agents/agent-1/versions/ver-2/configuration') {
        return Promise.resolve({
          versionId: 'ver-2',
          configuration: DEFAULT_AGENT_CONFIGURATION_V1,
          schemaVersion: 1,
        });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });

    const result = await loadAgentDetailData(CONTEXT_ADMIN, 'usr-1', 'agent-1');

    expect(result.isNotFound).toBe(false);
    expect(result.errorMessage).toBeNull();
    expect(result.agent?.name).toBe('Agent 1');
    expect(result.draftVersion?.id).toBe('ver-2');
    expect(result.draftConfig?.persona.role).toBe(DEFAULT_AGENT_CONFIGURATION_V1.persona.role);
  });

  it('does NOT fetch draft configuration when user has VIEWER role', async () => {
    mockRequest.mockImplementation(({ path }: { path: string }) => {
      if (path === '/v1/agents/agent-1') {
        return Promise.resolve({ id: 'agent-1', name: 'Agent 1' });
      }
      if (path === '/v1/agents/agent-1/versions') {
        return Promise.resolve([{ id: 'ver-2', versionNumber: 2, status: 'DRAFT' }]);
      }
      return Promise.reject(new Error(`Forbidden configuration fetch: ${path}`));
    });

    const result = await loadAgentDetailData(CONTEXT_VIEWER, 'usr-viewer', 'agent-1');

    expect(result.isNotFound).toBe(false);
    expect(result.draftVersion?.id).toBe('ver-2');
    expect(result.draftConfig).toBeNull();
    expect(mockRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: '/v1/agents/agent-1/versions/ver-2/configuration' }),
    );
  });

  it('returns isNotFound=true when backend returns 404', async () => {
    const error404 = new Error('Not found');
    (error404 as unknown as { status: number }).status = 404;
    mockRequest.mockRejectedValueOnce(error404);

    const result = await loadAgentDetailData(CONTEXT_ADMIN, 'usr-1', 'agent-missing');

    expect(result.isNotFound).toBe(true);
    expect(result.agent).toBeNull();
    expect(result.errorMessage).toBeNull();
  });

  it('returns errorMessage on unexpected 500 error', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Internal Server Error'));

    const result = await loadAgentDetailData(CONTEXT_ADMIN, 'usr-1', 'agent-err');

    expect(result.isNotFound).toBe(false);
    expect(result.agent).toBeNull();
    expect(result.errorMessage).toBe('Não foi possível carregar os detalhes do agente.');
  });
});
