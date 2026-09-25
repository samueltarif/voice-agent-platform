import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerOrganizationContext } from '../../../lib/organization/server-organization-context.js';
import { getInternalApiClient } from '../../../lib/api/api-client-factory.js';
import { GET } from './route.js';

vi.mock('../../../lib/organization/server-organization-context.js', () => ({
  getServerOrganizationContext: vi.fn(),
}));

vi.mock('../../../lib/api/api-client-factory.js', () => ({
  getInternalApiClient: vi.fn(),
}));

describe('GET /api/agents (BFF Tenant Proxy)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects cross-origin requests with 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'GET',
      headers: {
        host: 'localhost:3000',
        origin: 'http://attacker.com',
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Origem da requisição não autorizada');
  });

  it('returns 401 when session is unauthenticated', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'UNAUTHENTICATED',
      availableOrganizations: [],
    });

    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'GET',
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 when user has no active organization resolved', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'NO_ORGANIZATIONS',
      availableOrganizations: [],
    });

    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'GET',
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('returns tenant agents using TenantApiClient when active org is resolved', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-uuid-1',
        slug: 'org-a',
        name: 'Organization A',
        role: 'ADMIN',
      },
      availableOrganizations: [],
      user: { id: 'usr-1', email: 'user@example.com' },
    });

    const mockRequest = vi.fn().mockResolvedValueOnce([{ id: 'agent-1', name: 'Agent Alpha' }]);
    vi.mocked(getInternalApiClient).mockReturnValueOnce({
      request: mockRequest,
    } as never);

    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'GET',
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.organization).toEqual({ slug: 'org-a', name: 'Organization A' });
    expect(data.agents).toEqual([{ id: 'agent-1', name: 'Agent Alpha' }]);
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/v1/agents',
        organizationId: 'org-uuid-1',
        userId: 'usr-1',
      }),
    );
  });
});
