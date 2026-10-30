import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route.js';
import { mockApi, operationsReq, resolveTenant } from '../operations-bff-test-kit.js';

vi.mock('../../../lib/organization/server-organization-context.js', () => ({
  getServerOrganizationContext: vi.fn(),
}));
vi.mock('../../../lib/api/api-client-factory.js', () => ({ getInternalApiClient: vi.fn() }));

const AGENT = '6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5';
const create = (body: unknown) => POST(operationsReq('/api/campaigns', { method: 'POST', body }));

describe('008-MVP2 BFF /api/campaigns', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveTenant();
  });

  it('lists campaigns wrapped for the screen', async () => {
    mockApi([{ id: 'c1' }]);
    const res = await GET(operationsReq('/api/campaigns'));
    expect(await res.json()).toEqual({ campaigns: [{ id: 'c1' }] });
  });

  it('creates a DRAFT pinned to the PUBLISHED version resolved on the server', async () => {
    const api = mockApi(
      [
        { id: 'v-draft', status: 'DRAFT' },
        { id: 'v-pub', status: 'PUBLISHED' },
      ],
      { id: 'camp-1', status: 'DRAFT' },
    );
    const res = await create({ name: 'Reativação', agentId: AGENT });
    expect(res.status).toBe(201);
    expect(api).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'POST',
        path: '/v1/campaigns',
        body: { name: 'Reativação', agentId: AGENT, agentVersionId: 'v-pub', status: 'DRAFT' },
      }),
    );
  });

  it('refuses to create without a published version (409) and never posts the campaign', async () => {
    const api = mockApi([{ id: 'v-draft', status: 'DRAFT' }]);
    const res = await create({ name: 'Sem versão', agentId: AGENT });
    expect([res.status, await res.json()]).toEqual([409, { code: 'NO_PUBLISHED_VERSION' }]);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('does not let the client choose the version, status or tenant', async () => {
    const api = mockApi();
    for (const extra of [
      { agentVersionId: AGENT },
      { status: 'ACTIVE' },
      { organizationId: AGENT },
    ]) {
      const res = await create({ name: 'X', agentId: AGENT, ...extra });
      expect(res.status).toBe(400);
    }
    expect((await create({ name: 'X', agentId: '../agents' })).status).toBe(400);
    expect(api).not.toHaveBeenCalled();
  });
});
