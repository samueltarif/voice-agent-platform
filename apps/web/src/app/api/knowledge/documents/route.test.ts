import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route.js';
import * as serverOrgContext from '../../../../lib/organization/server-organization-context.js';
import * as clientFactory from '../../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../../lib/api/tenant-api-client.js';

vi.mock('../../../../lib/organization/server-organization-context.js');
vi.mock('../../../../lib/api/api-client-factory.js');

function authedOrg(role = 'OWNER') {
  return {
    status: 'RESOLVED' as const,
    context: { organizationId: 'org-1', slug: 'org-a', name: 'Org A', role },
    availableOrganizations: [],
    user: { id: 'usr-1', email: 'u@example.com' },
  };
}

function sameOrigin(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'x-knowledge-org-slug': 'org-a',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('BFF /api/knowledge/documents foundation (mocked, no DB)', () => {
  const mockTenantRequest = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue(
      authedOrg() as unknown as Awaited<
        ReturnType<typeof serverOrgContext.getServerOrganizationContext>
      >,
    );
    vi.spyOn(clientFactory, 'getInternalApiClient').mockReturnValue({
      request: vi.fn(),
    } as unknown as ReturnType<typeof clientFactory.getInternalApiClient>);
    vi.spyOn(TenantApiClient.prototype, 'request').mockImplementation(mockTenantRequest);
  });

  it('rejects unauthenticated list with 401', async () => {
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValueOnce({
      status: 'UNAUTHENTICATED',
      availableOrganizations: [],
    } as unknown as Awaited<ReturnType<typeof serverOrgContext.getServerOrganizationContext>>);
    const res = await GET(sameOrigin('http://localhost:3000/api/knowledge/documents', 'GET'));
    expect(res.status).toBe(401);
    expect(mockTenantRequest).not.toHaveBeenCalled();
  });

  it('denies OPERATOR list with 403 without calling internal API', async () => {
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValueOnce(
      authedOrg('OPERATOR') as unknown as Awaited<
        ReturnType<typeof serverOrgContext.getServerOrganizationContext>
      >,
    );
    const res = await GET(sameOrigin('http://localhost:3000/api/knowledge/documents', 'GET'));
    expect(res.status).toBe(403);
    expect(mockTenantRequest).not.toHaveBeenCalled();
  });

  it('lists via internal API with trusted org, no client override', async () => {
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValueOnce(
      authedOrg('MANAGER') as unknown as Awaited<
        ReturnType<typeof serverOrgContext.getServerOrganizationContext>
      >,
    );
    mockTenantRequest.mockResolvedValueOnce([{ id: 'd1' }]);
    const res = await GET(
      sameOrigin('http://localhost:3000/api/knowledge/documents?limit=5', 'GET'),
    );
    expect(res.status).toBe(200);
    expect(mockTenantRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: expect.stringContaining('/v1/knowledge/documents'),
      }),
    );
    const calledPath = (mockTenantRequest.mock.calls[0]?.[0] as { path: string }).path;
    expect(calledPath).not.toContain('org-1-evil');
    const body = (await res.json()) as { documents: unknown };
    expect(body.documents).toEqual([{ id: 'd1' }]);
  });

  it('denies VIEWER ingest with 403 without calling internal API', async () => {
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValueOnce(
      authedOrg('VIEWER') as unknown as Awaited<
        ReturnType<typeof serverOrgContext.getServerOrganizationContext>
      >,
    );
    const res = await POST(
      sameOrigin('http://localhost:3000/api/knowledge/documents', 'POST', {
        title: 'T',
        source: { sourceType: 'FAQ', locator: 'faq/x' },
        rawText: 'hello',
      }),
    );
    expect(res.status).toBe(403);
    expect(mockTenantRequest).not.toHaveBeenCalled();
  });

  it('rejects oversized rawText with 400 before internal call', async () => {
    const res = await POST(
      sameOrigin('http://localhost:3000/api/knowledge/documents', 'POST', {
        title: 'T',
        source: { sourceType: 'FAQ', locator: 'faq/x' },
        rawText: 'x'.repeat(200_001),
      }),
    );
    expect(res.status).toBe(400);
    expect(mockTenantRequest).not.toHaveBeenCalled();
  });

  it('sanitizes unexpected internal error to 500 without secrets', async () => {
    mockTenantRequest.mockRejectedValueOnce(new Error('boom SELECT secret'));
    const res = await POST(
      sameOrigin('http://localhost:3000/api/knowledge/documents', 'POST', {
        title: 'Valid Title',
        source: { sourceType: 'FAQ', locator: 'faq/ok' },
        rawText: 'valid text',
      }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toMatch(/SELECT|secret|BEGIN|COMMIT/i);
  });
});
