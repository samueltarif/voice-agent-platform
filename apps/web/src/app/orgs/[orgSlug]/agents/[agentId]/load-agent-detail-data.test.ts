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

/**
 * TEST_CHANGE_REASON = F1_CONTRACT_UUID_IDS (DEC-051), ASSERTION_EQUIVALENT:
 * os ids de exemplo passam a seguir o contrato da API (UUID), porque ids fora
 * do contrato agora são recusados antes de qualquer chamada. As expectativas
 * são as mesmas, só com os novos valores.
 */
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
      if (path === '/v1/agents/a0000000-0000-4000-8000-000000000001') {
        return Promise.resolve({ id: 'a0000000-0000-4000-8000-000000000001', name: 'Agent 1' });
      }
      if (path === '/v1/agents/a0000000-0000-4000-8000-000000000001/versions') {
        return Promise.resolve([
          { id: 'b0000000-0000-4000-8000-000000000001', versionNumber: 1, status: 'PUBLISHED' },
          { id: 'b0000000-0000-4000-8000-000000000002', versionNumber: 2, status: 'DRAFT' },
        ]);
      }
      if (
        path ===
        '/v1/agents/a0000000-0000-4000-8000-000000000001/versions/b0000000-0000-4000-8000-000000000002/configuration'
      ) {
        return Promise.resolve({
          versionId: 'b0000000-0000-4000-8000-000000000002',
          configuration: DEFAULT_AGENT_CONFIGURATION_V1,
          schemaVersion: 1,
        });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });

    const result = await loadAgentDetailData(
      CONTEXT_ADMIN,
      'usr-1',
      'a0000000-0000-4000-8000-000000000001',
    );

    expect(result.isNotFound).toBe(false);
    expect(result.errorMessage).toBeNull();
    expect(result.agent?.name).toBe('Agent 1');
    expect(result.draftVersion?.id).toBe('b0000000-0000-4000-8000-000000000002');
    expect(result.draftConfig?.persona.role).toBe(DEFAULT_AGENT_CONFIGURATION_V1.persona.role);
    expect(result.publishedConfig).toBeNull();
  });

  it('loads published configuration when no draft exists and published version is present', async () => {
    mockRequest.mockImplementation(({ path }: { path: string }) => {
      if (path === '/v1/agents/a0000000-0000-4000-8000-000000000001') {
        return Promise.resolve({ id: 'a0000000-0000-4000-8000-000000000001', name: 'Agent 1' });
      }
      if (path === '/v1/agents/a0000000-0000-4000-8000-000000000001/versions') {
        return Promise.resolve([
          { id: 'b0000000-0000-4000-8000-000000000001', versionNumber: 1, status: 'PUBLISHED' },
        ]);
      }
      if (
        path ===
        '/v1/agents/a0000000-0000-4000-8000-000000000001/versions/b0000000-0000-4000-8000-000000000001/configuration'
      ) {
        return Promise.resolve({
          versionId: 'b0000000-0000-4000-8000-000000000001',
          configuration: DEFAULT_AGENT_CONFIGURATION_V1,
          schemaVersion: 1,
        });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });

    const result = await loadAgentDetailData(
      CONTEXT_ADMIN,
      'usr-1',
      'a0000000-0000-4000-8000-000000000001',
    );

    expect(result.draftVersion).toBeNull();
    expect(result.draftConfig).toBeNull();
    expect(result.publishedConfig?.persona.role).toBe(DEFAULT_AGENT_CONFIGURATION_V1.persona.role);
  });

  it('does NOT fetch draft or published configuration when user has VIEWER role', async () => {
    mockRequest.mockImplementation(({ path }: { path: string }) => {
      if (path === '/v1/agents/a0000000-0000-4000-8000-000000000001') {
        return Promise.resolve({ id: 'a0000000-0000-4000-8000-000000000001', name: 'Agent 1' });
      }
      if (path === '/v1/agents/a0000000-0000-4000-8000-000000000001/versions') {
        return Promise.resolve([
          { id: 'b0000000-0000-4000-8000-000000000001', versionNumber: 1, status: 'PUBLISHED' },
          { id: 'b0000000-0000-4000-8000-000000000002', versionNumber: 2, status: 'DRAFT' },
        ]);
      }
      return Promise.reject(new Error(`Forbidden configuration fetch: ${path}`));
    });

    const result = await loadAgentDetailData(
      CONTEXT_VIEWER,
      'usr-viewer',
      'a0000000-0000-4000-8000-000000000001',
    );

    expect(result.isNotFound).toBe(false);
    expect(result.draftVersion?.id).toBe('b0000000-0000-4000-8000-000000000002');
    expect(result.draftConfig).toBeNull();
    expect(result.publishedConfig).toBeNull();
  });

  it('returns isNotFound=true when backend returns 404', async () => {
    const error404 = new Error('Not found');
    (error404 as unknown as { status: number }).status = 404;
    mockRequest.mockRejectedValueOnce(error404);

    const result = await loadAgentDetailData(
      CONTEXT_ADMIN,
      'usr-1',
      'a0000000-0000-4000-8000-0000000000f4',
    );

    expect(result.isNotFound).toBe(true);
    expect(result.agent).toBeNull();
    expect(result.errorMessage).toBeNull();
  });

  it('returns errorMessage on unexpected 500 error', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Internal Server Error'));

    const result = await loadAgentDetailData(
      CONTEXT_ADMIN,
      'usr-1',
      'a0000000-0000-4000-8000-0000000000e5',
    );

    expect(result.isNotFound).toBe(false);
    expect(result.agent).toBeNull();
    expect(result.errorMessage).toBe('Não foi possível carregar os detalhes do agente.');
  });
});
