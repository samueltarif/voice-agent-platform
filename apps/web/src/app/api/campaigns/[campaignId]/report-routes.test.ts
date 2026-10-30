import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as report } from './report/route.js';
import { GET as attempts } from './attempts/route.js';
import { mockApi, operationsReq, params, resolveTenant } from '../../operations-bff-test-kit.js';

vi.mock('../../../../lib/organization/server-organization-context.js', () => ({
  getServerOrganizationContext: vi.fn(),
}));
vi.mock('../../../../lib/api/api-client-factory.js', () => ({ getInternalApiClient: vi.fn() }));

const ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

describe('008-MVP4 BFF campaign report', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveTenant('VIEWER');
  });

  it('returns the report exactly as the API produced it (costs decided by the API)', async () => {
    const api = mockApi({ campaignId: ID, costs: null });
    const res = await report(
      operationsReq(`/api/campaigns/${ID}/report`),
      params({ campaignId: ID }),
    );
    expect(await res.json()).toEqual({ report: { campaignId: ID, costs: null } });
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: `/v1/campaigns/${ID}/report`,
        userId: 'usr-1',
      }),
    );
  });

  it('forwards only whitelisted attempt filters', async () => {
    const api = mockApi([]);
    const res = await attempts(
      operationsReq(`/api/campaigns/${ID}/attempts?limit=26&offset=25&outcome=HELD_BY_PAUSE&org=x`),
      params({ campaignId: ID }),
    );
    expect(await res.json()).toEqual({ attempts: [] });
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/campaigns/${ID}/attempts?limit=26&offset=25&outcome=HELD_BY_PAUSE`,
      }),
    );
  });

  it('answers 404 for invalid ids and maps API errors to stable codes', async () => {
    const api = mockApi(
      Object.assign(new Error('nf'), { status: 404, data: { error: { code: 'NOT_FOUND' } } }),
    );
    expect(
      (await report(operationsReq('/api/campaigns/x/report'), params({ campaignId: '../x' })))
        .status,
    ).toBe(404);
    expect(api).not.toHaveBeenCalled();
    const foreign = await report(
      operationsReq(`/api/campaigns/${ID}/report`),
      params({ campaignId: ID }),
    );
    expect([foreign.status, await foreign.json()]).toEqual([404, { code: 'NOT_FOUND' }]);
  });
});
