import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route.js';
import * as serverOrgContext from '../../../../../lib/organization/server-organization-context.js';
import * as clientFactory from '../../../../../lib/api/api-client-factory.js';

vi.mock('../../../../../lib/organization/server-organization-context.js');
vi.mock('../../../../../lib/api/api-client-factory.js');

describe('BFF Agent Archive Route (/api/agents/[agentId]/archive)', () => {
  const agentId = '11111111-1111-4111-8111-111111111111';
  const routeParams = { params: Promise.resolve({ agentId }) };

  const mockResolvedContext = {
    status: 'RESOLVED' as const,
    context: {
      organizationId: 'org-1-id',
      slug: 'org-alpha',
      name: 'Org Alpha',
      role: 'ADMIN',
    },
    user: { id: 'user-1-id', email: 'admin@example.com' },
    availableOrganizations: [],
  };

  const mockTenantRequest = vi.fn();
  const mockInternalClient = { request: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue(
      mockResolvedContext as unknown as Awaited<
        ReturnType<typeof serverOrgContext.getServerOrganizationContext>
      >,
    );
    vi.spyOn(clientFactory, 'getInternalApiClient').mockReturnValue(
      mockInternalClient as unknown as ReturnType<typeof clientFactory.getInternalApiClient>,
    );

    const { TenantApiClient } = vi.mocked(
      await import('../../../../../lib/api/tenant-api-client.js'),
    );
    vi.spyOn(TenantApiClient.prototype, 'request').mockImplementation(mockTenantRequest);
  });

  describe('CSRF / Same-Origin Protection', () => {
    it('rejects cross-origin requests with 403', async () => {
      const req = new NextRequest(`http://localhost:3000/api/agents/${agentId}/archive`, {
        method: 'POST',
        headers: { origin: 'http://malicious-site.com', host: 'localhost:3000' },
      });

      const res = await POST(req, routeParams);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Origem da requisição não autorizada.');
    });
  });

  describe('Authentication & RBAC', () => {
    it('returns 401 when unauthenticated', async () => {
      vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue({
        status: 'UNAUTHENTICATED',
        availableOrganizations: [],
      });

      const req = new NextRequest(`http://localhost:3000/api/agents/${agentId}/archive`, {
        method: 'POST',
        headers: { host: 'localhost:3000' },
      });

      const res = await POST(req, routeParams);
      expect(res.status).toBe(401);
    });

    it('rejects MANAGER with 403', async () => {
      vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue({
        ...mockResolvedContext,
        context: { ...mockResolvedContext.context, role: 'MANAGER' },
      });

      const req = new NextRequest(`http://localhost:3000/api/agents/${agentId}/archive`, {
        method: 'POST',
        headers: { host: 'localhost:3000' },
      });

      const res = await POST(req, routeParams);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
    });

    it('rejects OPERATOR and VIEWER with 403', async () => {
      for (const role of ['OPERATOR', 'VIEWER'] as const) {
        vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue({
          ...mockResolvedContext,
          context: { ...mockResolvedContext.context, role },
        });

        const req = new NextRequest(`http://localhost:3000/api/agents/${agentId}/archive`, {
          method: 'POST',
          headers: { host: 'localhost:3000' },
        });

        const res = await POST(req, routeParams);
        expect(res.status).toBe(403);
      }
    });
  });

  describe('Archive Execution', () => {
    it('calls backend archive endpoint and returns archived agent for ADMIN and OWNER', async () => {
      const mockArchivedAgent = {
        id: agentId,
        name: 'Archived Agent',
        status: 'ARCHIVED',
      };
      mockTenantRequest.mockResolvedValue(mockArchivedAgent);

      for (const role of ['ADMIN', 'OWNER'] as const) {
        vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue({
          ...mockResolvedContext,
          context: { ...mockResolvedContext.context, role },
        });

        const req = new NextRequest(`http://localhost:3000/api/agents/${agentId}/archive`, {
          method: 'POST',
          headers: { host: 'localhost:3000' },
        });

        const res = await POST(req, routeParams);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual(mockArchivedAgent);
        expect(mockTenantRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'POST',
            path: `/v1/agents/${agentId}/archive`,
          }),
        );
      }
    });
  });
});
