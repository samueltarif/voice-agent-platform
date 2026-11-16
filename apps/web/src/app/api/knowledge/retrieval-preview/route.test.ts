import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route.js';
import * as serverOrgContext from '../../../../lib/organization/server-organization-context.js';
import * as clientFactory from '../../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../../lib/api/tenant-api-client.js';

vi.mock('../../../../lib/organization/server-organization-context.js');
vi.mock('../../../../lib/api/api-client-factory.js');

const URL = 'http://localhost:3000/api/knowledge/retrieval-preview';
const AGENT = '33333333-3333-3333-3333-333333333333';
type Ctx = Awaited<ReturnType<typeof serverOrgContext.getServerOrganizationContext>>;

function org(role: string): Ctx {
  return {
    status: 'RESOLVED',
    context: { organizationId: 'org-1', slug: 'org-a', name: 'Org A', role },
    availableOrganizations: [],
    user: { id: 'usr-1', email: 'u@example.com' },
  } as unknown as Ctx;
}

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(URL, {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'x-knowledge-org-slug': 'org-a',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('BFF POST /api/knowledge/retrieval-preview (DEC-055)', () => {
  const tenantRequest = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue(org('MANAGER'));
    vi.spyOn(clientFactory, 'getInternalApiClient').mockReturnValue(
      {} as ReturnType<typeof clientFactory.getInternalApiClient>,
    );
    vi.spyOn(TenantApiClient.prototype, 'request').mockImplementation(tenantRequest);
    tenantRequest.mockResolvedValue({ trust: 'UNTRUSTED_DATA', hits: [] });
  });

  it('forwards the validated question and wraps the preview', async () => {
    const body = { queryText: 'Quais transmissores de pressão?', agentId: AGENT };
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ preview: { trust: 'UNTRUSTED_DATA', hits: [] } });
    expect(tenantRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', path: '/v1/knowledge/retrieval-preview', body }),
    );
  });

  it('rejects invalid bodies, other roles, other tabs and foreign origins without calling the API', async () => {
    expect((await POST(req({ queryText: '' }))).status).toBe(400);
    expect((await POST(req({ queryText: 'x', organizationId: 'org-2' }))).status).toBe(400);
    expect((await POST(req({ queryText: 'x' }, { 'x-knowledge-org-slug': 'org-b' }))).status).toBe(
      409,
    );
    expect((await POST(req({ queryText: 'x' }, { origin: 'https://evil.example' }))).status).toBe(
      403,
    );
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue(org('VIEWER'));
    expect((await POST(req({ queryText: 'x' }))).status).toBe(403);
    expect(tenantRequest).not.toHaveBeenCalled();
  });

  it('explains an unpublished agent in Portuguese', async () => {
    tenantRequest.mockRejectedValueOnce(
      Object.assign(new Error('x'), {
        status: 409,
        data: { error: { code: 'KNOWLEDGE_AGENT_NOT_PUBLISHED', message: 'raw' } },
      }),
    );
    const res = await POST(req({ queryText: 'x', agentId: AGENT }));
    const payload = (await res.json()) as { error: string };
    expect(res.status).toBe(409);
    expect(payload.error).toContain('ainda não tem versão publicada');
  });
});
