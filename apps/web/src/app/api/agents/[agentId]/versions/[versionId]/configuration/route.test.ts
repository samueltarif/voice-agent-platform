import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route.js';
import * as serverOrgContext from '../../../../../../../lib/organization/server-organization-context.js';
import * as clientFactory from '../../../../../../../lib/api/api-client-factory.js';

vi.mock('../../../../../../../lib/organization/server-organization-context.js');
vi.mock('../../../../../../../lib/api/api-client-factory.js');

describe('BFF Agent Version Configuration Route (/api/agents/[agentId]/versions/[versionId]/configuration)', () => {
  const agentId = '11111111-1111-4111-8111-111111111111';
  const versionId = '22222222-2222-4222-8222-222222222222';
  const routeParams = { params: Promise.resolve({ agentId, versionId }) };

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
      await import('../../../../../../../lib/api/tenant-api-client.js'),
    );
    vi.spyOn(TenantApiClient.prototype, 'request').mockImplementation(mockTenantRequest);
  });

  describe('CSRF / Same-Origin Protection', () => {
    it('rejects cross-origin requests with 403', async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/agents/${agentId}/versions/${versionId}/configuration`,
        {
          method: 'GET',
          headers: { origin: 'http://malicious-site.com', host: 'localhost:3000' },
        },
      );

      const res = await GET(req, routeParams);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Origem da requisição não autorizada.');
    });
  });

  describe('Authentication & Confidentiality RBAC', () => {
    it('returns 401 when unauthenticated', async () => {
      vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue({
        status: 'UNAUTHENTICATED',
        availableOrganizations: [],
      });

      const req = new NextRequest(
        `http://localhost:3000/api/agents/${agentId}/versions/${versionId}/configuration`,
        {
          method: 'GET',
          headers: { host: 'localhost:3000' },
        },
      );

      const res = await GET(req, routeParams);
      expect(res.status).toBe(401);
    });

    it('denies OPERATOR and VIEWER roles from reading version configuration (403)', async () => {
      for (const role of ['OPERATOR', 'VIEWER'] as const) {
        vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue({
          ...mockResolvedContext,
          context: { ...mockResolvedContext.context, role },
        });

        const req = new NextRequest(
          `http://localhost:3000/api/agents/${agentId}/versions/${versionId}/configuration`,
          {
            method: 'GET',
            headers: { host: 'localhost:3000' },
          },
        );

        const res = await GET(req, routeParams);
        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.code).toBe('FORBIDDEN');
      }
    });

    it('allows OWNER, ADMIN and MANAGER to read configuration snapshot', async () => {
      const mockConfigSnapshot = {
        configuration: {
          persona: { name: 'Support Bot' },
        },
      };
      mockTenantRequest.mockResolvedValue(mockConfigSnapshot);

      for (const role of ['OWNER', 'ADMIN', 'MANAGER'] as const) {
        vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue({
          ...mockResolvedContext,
          context: { ...mockResolvedContext.context, role },
        });

        const req = new NextRequest(
          `http://localhost:3000/api/agents/${agentId}/versions/${versionId}/configuration`,
          {
            method: 'GET',
            headers: { host: 'localhost:3000' },
          },
        );

        const res = await GET(req, routeParams);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual(mockConfigSnapshot);
        expect(mockTenantRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'GET',
            path: `/v1/agents/${agentId}/versions/${versionId}/configuration`,
          }),
        );
      }
    });
  });
});
