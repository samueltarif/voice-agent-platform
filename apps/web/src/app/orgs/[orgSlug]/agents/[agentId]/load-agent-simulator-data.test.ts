import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantApiClient } from '../../../../../lib/api/tenant-api-client.js';
import { loadAgentDetailData, loadAgentSimulatorData } from './load-agent-detail-data.js';

vi.mock('../../../../../lib/api/api-client-factory.js', () => ({
  getInternalApiClient: vi.fn(() => ({})),
}));
vi.mock('../../../../../lib/api/tenant-api-client.js', () => ({ TenantApiClient: vi.fn() }));

const versions = [
  { id: 'v-draft', status: 'DRAFT' },
  { id: 'v-pub', status: 'PUBLISHED' },
];

function mockApi() {
  const paths: string[] = [];
  vi.mocked(TenantApiClient).mockImplementation(
    () =>
      ({
        request: async ({ path }: { path: string }) => {
          paths.push(path);
          if (path.endsWith('/versions')) return versions;
          if (path.endsWith('/configuration')) return { configuration: { marker: path } };
          return { id: 'agent-1', name: 'Agente' };
        },
      }) as never,
  );
  return paths;
}

const ctx = (role: string) =>
  ({ organizationId: 'org-1', slug: 'org', name: 'Org', role }) as never;

describe('load agent detail data — draft and published configuration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('detail page keeps loading only the draft when one exists (unchanged behavior)', async () => {
    const paths = mockApi();
    const result = await loadAgentDetailData(ctx('ADMIN'), 'user-1', 'agent-1');
    expect(result.draftConfig).not.toBeNull();
    expect(result.publishedConfig).toBeNull();
    expect(paths.filter((p) => p.endsWith('/configuration'))).toEqual([
      '/v1/agents/agent-1/versions/v-draft/configuration',
    ]);
  });

  it('simulator loads both saved configurations through the same authenticated route', async () => {
    const paths = mockApi();
    const result = await loadAgentSimulatorData(ctx('MANAGER'), 'user-1', 'agent-1');
    expect(result.draftConfig).not.toBeNull();
    expect(result.publishedConfig).not.toBeNull();
    expect(paths.filter((p) => p.endsWith('/configuration'))).toHaveLength(2);
    expect(vi.mocked(TenantApiClient).mock.calls[0]![1]).toMatchObject({ organizationId: 'org-1' });
  });

  it('never requests configurations for roles without read permission', async () => {
    const paths = mockApi();
    const result = await loadAgentSimulatorData(ctx('MEMBER'), 'user-1', 'agent-1');
    expect(result.draftConfig).toBeNull();
    expect(result.publishedConfig).toBeNull();
    expect(paths.some((p) => p.endsWith('/configuration'))).toBe(false);
  });
});
