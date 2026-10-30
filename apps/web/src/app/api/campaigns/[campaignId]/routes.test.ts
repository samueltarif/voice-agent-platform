import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route.js';
import { PUT } from './audience/route.js';
import { POST } from './actions/route.js';
import { mockApi, operationsReq, params, resolveTenant } from '../../operations-bff-test-kit.js';

vi.mock('../../../../lib/organization/server-organization-context.js', () => ({
  getServerOrganizationContext: vi.fn(),
}));
vi.mock('../../../../lib/api/api-client-factory.js', () => ({ getInternalApiClient: vi.fn() }));

const ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const LIST = '9a8b7c6d-5e4f-4a3b-9c1d-0e1f2a3b4c5d';
const at = (sub = '') => `/api/campaigns/${ID}${sub}`;

describe('008-MVP2 BFF /api/campaigns/{id}', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveTenant();
  });

  it('returns campaign, real progress and audience in one read', async () => {
    mockApi({ id: ID, status: 'ACTIVE' }, { progress: { total: 2 }, audience: null });
    const res = await GET(operationsReq(at()), params({ campaignId: ID }));
    expect(await res.json()).toEqual({
      campaign: { id: ID, status: 'ACTIVE' },
      progress: { total: 2 },
      audience: null,
    });
  });

  it('answers 404 for non-UUID ids without touching the session or the API', async () => {
    const api = mockApi();
    for (const bad of ['..%2Fagents', 'abc', `${ID}/actions`]) {
      const res = await GET(operationsReq(at()), params({ campaignId: bad }));
      expect(res.status).toBe(404);
    }
    expect(api).not.toHaveBeenCalled();
  });

  it('assigns the audience with PUT and only the validated fields', async () => {
    const api = mockApi({ status: 'ASSIGNED' });
    const res = await PUT(
      operationsReq(at('/audience'), { method: 'PUT', body: { contactListId: LIST } }),
      params({ campaignId: ID }),
    );
    expect(res.status).toBe(200);
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: `/v1/campaigns/${ID}/audience`,
        body: { contactListId: LIST },
      }),
    );
  });

  it('forwards only known lifecycle actions', async () => {
    const api = mockApi({ kind: 'TRANSITIONED', status: 'PAUSED' });
    const act = (action: string) =>
      POST(
        operationsReq(at('/actions'), { method: 'POST', body: { action } }),
        params({ campaignId: ID }),
      );
    expect((await act('DELETE')).status).toBe(400);
    expect((await act('PAUSE')).status).toBe(200);
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith(expect.objectContaining({ body: { action: 'PAUSE' } }));
  });
});
