import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH, DELETE } from './route.js';
import { PUT as AgentPUT } from './agent/route.js';
import { POST as RestorePOST } from './restore/route.js';
import * as serverOrgContext from '../../../../../lib/organization/server-organization-context.js';
import * as clientFactory from '../../../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../../../lib/api/tenant-api-client.js';

vi.mock('../../../../../lib/organization/server-organization-context.js');
vi.mock('../../../../../lib/api/api-client-factory.js');

const DOC = '22222222-2222-2222-2222-222222222222';
const AGENT = '33333333-3333-3333-3333-333333333333';
const STAMP = '2026-11-11T12:00:00.000Z';
const BASE = `http://localhost:3000/api/knowledge/documents/${DOC}`;
type Ctx = Awaited<ReturnType<typeof serverOrgContext.getServerOrganizationContext>>;

function org(role: string, status = 'RESOLVED'): Ctx {
  return {
    status,
    context: { organizationId: 'org-1', slug: 'org-a', name: 'Org A', role },
    availableOrganizations: [],
    user: { id: 'usr-1', email: 'u@example.com' },
  } as unknown as Ctx;
}

function req(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method,
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'x-knowledge-org-slug': 'org-a',
      'content-type': 'application/json',
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const params = (documentId = DOC) => ({ params: Promise.resolve({ documentId }) });

describe('BFF knowledge management routes (DEC-054)', () => {
  const tenantRequest = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue(org('OWNER'));
    vi.spyOn(clientFactory, 'getInternalApiClient').mockReturnValue(
      {} as ReturnType<typeof clientFactory.getInternalApiClient>,
    );
    vi.spyOn(TenantApiClient.prototype, 'request').mockImplementation(tenantRequest);
    tenantRequest.mockResolvedValue({ id: DOC });
  });

  it('forwards each operation with the validated body to the internal API', async () => {
    const edit = { expectedUpdatedAt: STAMP, title: 'Novo', collection: null };
    expect((await PATCH(req(BASE, 'PATCH', edit), params())).status).toBe(200);
    const link = { expectedUpdatedAt: STAMP, agentId: AGENT };
    expect((await AgentPUT(req(`${BASE}/agent`, 'PUT', link), params())).status).toBe(200);
    const token = { expectedUpdatedAt: STAMP };
    expect((await RestorePOST(req(`${BASE}/restore`, 'POST', token), params())).status).toBe(200);
    const del = await DELETE(req(`${BASE}?expectedUpdatedAt=${STAMP}`, 'DELETE'), params());
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ deleted: true });
    expect(tenantRequest.mock.calls.map(([o]) => [o.method, o.path, o.body])).toEqual([
      ['PATCH', `/v1/knowledge/documents/${DOC}`, edit],
      ['PUT', `/v1/knowledge/documents/${DOC}/agent`, link],
      ['POST', `/v1/knowledge/documents/${DOC}/restore`, token],
      [
        'DELETE',
        `/v1/knowledge/documents/${DOC}?expectedUpdatedAt=${encodeURIComponent(STAMP)}`,
        undefined,
      ],
    ]);
  });

  it('rejects invalid ids, bodies and extra fields before calling the API', async () => {
    const results = await Promise.all([
      PATCH(req(`${BASE}`, 'PATCH', { expectedUpdatedAt: STAMP, title: 'x' }), params('nope')),
      PATCH(req(BASE, 'PATCH', { title: 'sem token' }), params()),
      PATCH(req(BASE, 'PATCH', { expectedUpdatedAt: STAMP, organizationId: 'org-2' }), params()),
      AgentPUT(req(`${BASE}/agent`, 'PUT', { expectedUpdatedAt: STAMP, agentId: 'x' }), params()),
      RestorePOST(req(`${BASE}/restore`, 'POST', 'not-json'), params()),
      DELETE(req(BASE, 'DELETE'), params()),
    ]);
    for (const res of results) expect(res.status).toBe(400);
    expect(tenantRequest).not.toHaveBeenCalled();
  });

  it('mirrors the RBAC: MANAGER edits only; VIEWER nothing', async () => {
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue(org('MANAGER'));
    const body = { expectedUpdatedAt: STAMP, title: 'x' };
    expect((await PATCH(req(BASE, 'PATCH', body), params())).status).toBe(200);
    const link = { expectedUpdatedAt: STAMP, agentId: null };
    expect((await AgentPUT(req(`${BASE}/agent`, 'PUT', link), params())).status).toBe(403);
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue(org('VIEWER'));
    expect((await PATCH(req(BASE, 'PATCH', body), params())).status).toBe(403);
    expect(tenantRequest).toHaveBeenCalledTimes(1);
  });

  it('blocks cross-origin, unauthenticated and stale-organization requests', async () => {
    const body = { expectedUpdatedAt: STAMP, title: 'x' };
    const foreign = req(BASE, 'PATCH', body, { origin: 'https://evil.example' });
    expect((await PATCH(foreign, params())).status).toBe(403);
    const otherTab = req(BASE, 'PATCH', body, { 'x-knowledge-org-slug': 'org-b' });
    expect((await PATCH(otherTab, params())).status).toBe(409);
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue(
      org('OWNER', 'UNAUTHENTICATED'),
    );
    expect((await PATCH(req(BASE, 'PATCH', body), params())).status).toBe(401);
    expect(tenantRequest).not.toHaveBeenCalled();
  });

  it('translates domain error codes into safe Portuguese messages', async () => {
    tenantRequest.mockRejectedValueOnce(
      Object.assign(new Error('x'), {
        status: 409,
        data: { error: { code: 'KNOWLEDGE_PINNED_TO_AGENT_VERSION', message: 'raw' } },
      }),
    );
    const res = await PATCH(req(BASE, 'PATCH', { expectedUpdatedAt: STAMP, title: 'x' }), params());
    expect(res.status).toBe(409);
    const payload = (await res.json()) as { error: string; code: string };
    expect(payload.code).toBe('KNOWLEDGE_PINNED_TO_AGENT_VERSION');
    expect(payload.error).toContain('fixado a uma versão publicada');
    expect(payload.error).not.toContain('raw');
  });
});
