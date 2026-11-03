import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route.js';
import { mockApi, operationsReq, resolveTenant } from '../../operations-bff-test-kit.js';

vi.mock('../../../../lib/organization/server-organization-context.js', () => ({
  getServerOrganizationContext: vi.fn(),
}));
vi.mock('../../../../lib/api/api-client-factory.js', () => ({ getInternalApiClient: vi.fn() }));

describe('008-MVP4c BFF /api/operations/attempts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveTenant('VIEWER');
  });

  it('lists attempts of the session organization with whitelisted filters only', async () => {
    const api = mockApi([]);
    const res = await GET(
      operationsReq('/api/operations/attempts?days=30&limit=26&offset=0&outcome=ENDED&org=evil'),
    );
    expect(await res.json()).toEqual({ attempts: [] });
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/v1/operations/attempts?days=30&limit=26&offset=0&outcome=ENDED',
        userId: 'usr-1',
      }),
    );
  });

  it('refuses a stale tab of another organization before calling the API', async () => {
    const api = mockApi([]);
    const res = await GET(
      operationsReq('/api/operations/attempts', { headers: { 'x-operations-org-slug': 'org-b' } }),
    );
    expect(res.status).toBe(409);
    expect(api).not.toHaveBeenCalled();
  });
});
