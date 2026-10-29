import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerOrganizationContext } from '../../lib/organization/server-organization-context.js';
import { GET as listCampaigns } from './campaigns/route.js';
import { POST as addSuppression } from './contact-suppressions/route.js';
import { mockApi, apiError, operationsReq, resolveTenant } from './operations-bff-test-kit.js';

vi.mock('../../lib/organization/server-organization-context.js', () => ({
  getServerOrganizationContext: vi.fn(),
}));
vi.mock('../../lib/api/api-client-factory.js', () => ({ getInternalApiClient: vi.fn() }));

const body = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe('008-MVP2 operations BFF pipeline', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveTenant();
  });

  it('refuses cross-origin calls before resolving any session', async () => {
    const res = await listCampaigns(
      operationsReq('/api/campaigns', { headers: { origin: 'http://evil.example' } }),
    );
    expect(res.status).toBe(403);
    expect(await body(res)).toEqual({ code: 'ORIGIN_NOT_ALLOWED' });
    expect(getServerOrganizationContext).not.toHaveBeenCalled();
  });

  it('returns 401 without a session and 403 without an active organization', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'UNAUTHENTICATED',
      availableOrganizations: [],
    });
    expect((await listCampaigns(operationsReq('/api/campaigns'))).status).toBe(401);
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'NO_ORGANIZATIONS',
      availableOrganizations: [],
    });
    expect((await listCampaigns(operationsReq('/api/campaigns'))).status).toBe(403);
  });

  it('requires the screen to declare the organization and rejects a stale tab (409)', async () => {
    const api = mockApi([]);
    const missing = await listCampaigns(
      operationsReq('/api/campaigns', { headers: { 'x-operations-org-slug': '' } }),
    );
    expect(await body(missing)).toEqual({ code: 'ORG_CONTEXT_REQUIRED' });
    const stale = await listCampaigns(
      operationsReq('/api/campaigns', { headers: { 'x-operations-org-slug': 'org-b' } }),
    );
    expect(stale.status).toBe(409);
    expect(await body(stale)).toEqual({ code: 'ORG_CONTEXT_MISMATCH' });
    expect(api).not.toHaveBeenCalled();
  });

  it('maps API errors to stable codes without leaking internal messages', async () => {
    mockApi(apiError(403, 'FORBIDDEN'), apiError(409, 'bad code; drop'), apiError(500, 'X'));
    const forbidden = await listCampaigns(operationsReq('/api/campaigns'));
    expect([forbidden.status, await body(forbidden)]).toEqual([403, { code: 'FORBIDDEN' }]);
    const conflict = await listCampaigns(operationsReq('/api/campaigns'));
    expect(await body(conflict)).toEqual({ code: 'API_ERROR' });
    const crash = await listCampaigns(operationsReq('/api/campaigns'));
    expect([crash.status, await body(crash)]).toEqual([500, { code: 'INTERNAL_SERVER_ERROR' }]);
  });

  it('rejects malformed, unknown-field and oversized bodies before calling the API', async () => {
    const api = mockApi();
    const post = (b: unknown) =>
      addSuppression(operationsReq('/api/contact-suppressions', { method: 'POST', body: b }));
    expect((await post('{not json')).status).toBe(400);
    expect((await post({ phone: '11 98888-0000', reason: 'OPT_OUT', extra: 1 })).status).toBe(400);
    const huge = await post({ phone: 'x'.repeat(70 * 1024), reason: 'OPT_OUT' });
    expect([huge.status, await body(huge)]).toEqual([413, { code: 'PAYLOAD_TOO_LARGE' }]);
    expect(api).not.toHaveBeenCalled();
  });

  it('forwards the user and organization of the session, never the request body', async () => {
    const api = mockApi([]);
    await listCampaigns(operationsReq('/api/campaigns?limit=10&offset=5&organizationId=evil'));
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/v1/campaigns?limit=10&offset=5',
        userId: 'usr-1',
      }),
    );
  });
});
