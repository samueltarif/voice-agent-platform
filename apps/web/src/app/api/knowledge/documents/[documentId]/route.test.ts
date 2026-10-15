import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route.js';
import { POST as ArchivePOST } from './archive/route.js';
import * as serverOrgContext from '../../../../../lib/organization/server-organization-context.js';
import * as clientFactory from '../../../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../../../lib/api/tenant-api-client.js';

vi.mock('../../../../../lib/organization/server-organization-context.js');
vi.mock('../../../../../lib/api/api-client-factory.js');

const DOC_ID = '22222222-2222-2222-2222-222222222222';

function authedOrg(role = 'OWNER') {
  return {
    status: 'RESOLVED' as const,
    context: { organizationId: 'org-1', slug: 'org-a', name: 'Org A', role },
    availableOrganizations: [],
    user: { id: 'usr-1', email: 'u@example.com' },
  };
}

function getReq(url: string, method = 'GET'): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'x-knowledge-org-slug': 'org-a',
    },
  });
}

describe('BFF knowledge detail + archive (mocked)', () => {
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

  it('rejects invalid uuid with 400', async () => {
    const res = await GET(getReq('http://localhost:3000/api/knowledge/documents/not-uuid'), {
      params: Promise.resolve({ documentId: 'not-uuid' }),
    });
    expect(res.status).toBe(400);
    expect(mockTenantRequest).not.toHaveBeenCalled();
  });

  it('denies VIEWER detail with 403', async () => {
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValueOnce(
      authedOrg('VIEWER') as unknown as Awaited<
        ReturnType<typeof serverOrgContext.getServerOrganizationContext>
      >,
    );
    const res = await GET(getReq(`http://localhost:3000/api/knowledge/documents/${DOC_ID}`), {
      params: Promise.resolve({ documentId: DOC_ID }),
    });
    expect(res.status).toBe(403);
    expect(mockTenantRequest).not.toHaveBeenCalled();
  });

  it('denies MANAGER archive with 403 without internal call', async () => {
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValueOnce(
      authedOrg('MANAGER') as unknown as Awaited<
        ReturnType<typeof serverOrgContext.getServerOrganizationContext>
      >,
    );
    const res = await ArchivePOST(
      getReq(`http://localhost:3000/api/knowledge/documents/${DOC_ID}/archive`, 'POST'),
      { params: Promise.resolve({ documentId: DOC_ID }) },
    );
    expect(res.status).toBe(403);
    expect(mockTenantRequest).not.toHaveBeenCalled();
  });

  it('forwards archive for ADMIN to internal API path', async () => {
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValueOnce(
      authedOrg('ADMIN') as unknown as Awaited<
        ReturnType<typeof serverOrgContext.getServerOrganizationContext>
      >,
    );
    mockTenantRequest.mockResolvedValueOnce({ id: DOC_ID, status: 'ARCHIVED' });
    const res = await ArchivePOST(
      getReq(`http://localhost:3000/api/knowledge/documents/${DOC_ID}/archive`, 'POST'),
      { params: Promise.resolve({ documentId: DOC_ID }) },
    );
    expect(res.status).toBe(200);
    expect(mockTenantRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: `/v1/knowledge/documents/${DOC_ID}/archive`,
      }),
    );
  });
});
