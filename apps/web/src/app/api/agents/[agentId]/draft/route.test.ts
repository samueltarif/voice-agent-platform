import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PATCH, DELETE } from './route.js';
import * as serverOrgContext from '../../../../../lib/organization/server-organization-context.js';
import * as clientFactory from '../../../../../lib/api/api-client-factory.js';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from '../../../../../features/agents/agent-default-configuration.js';

vi.mock('../../../../../lib/organization/server-organization-context.js');
vi.mock('../../../../../lib/api/api-client-factory.js');

describe('BFF Agent Draft Route (/api/agents/[agentId]/draft)', () => {
  const agentId = '11111111-1111-4111-8111-111111111111';
  const versionId = '22222222-2222-4222-8222-222222222222';
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

    // Mock TenantApiClient prototype request
    const { TenantApiClient } = vi.mocked(
      await import('../../../../../lib/api/tenant-api-client.js'),
    );
    vi.spyOn(TenantApiClient.prototype, 'request').mockImplementation(mockTenantRequest);
  });

  describe('CSRF / Same-Origin Protection', () => {
    it('rejects cross-origin POST requests with 403', async () => {
      const req = new NextRequest(`http://localhost:3000/api/agents/${agentId}/draft`, {
        method: 'POST',
        headers: {
          origin: 'http://malicious-site.com',
          host: 'localhost:3000',
        },
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

      const req = new NextRequest(`http://localhost:3000/api/agents/${agentId}/draft`, {
        method: 'POST',
        headers: { host: 'localhost:3000' },
      });

      const res = await POST(req, routeParams);
      expect(res.status).toBe(401);
    });

    it('returns 403 when user has non-edit role (e.g. VIEWER or OPERATOR)', async () => {
      vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue({
        status: 'RESOLVED',
        context: {
          organizationId: 'org-1-id',
          slug: 'org-alpha',
          name: 'Org Alpha',
          role: 'VIEWER',
        },
        user: { id: 'user-1-id', email: 'viewer@example.com' },
      } as unknown as Awaited<ReturnType<typeof serverOrgContext.getServerOrganizationContext>>);

      const req = new NextRequest(`http://localhost:3000/api/agents/${agentId}/draft`, {
        method: 'POST',
        headers: { host: 'localhost:3000' },
      });

      const res = await POST(req, routeParams);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/agents/[agentId]/draft (Create Draft)', () => {
    it('creates draft using default configuration if body is empty', async () => {
      mockTenantRequest.mockResolvedValue({ id: versionId, versionNumber: 2, status: 'DRAFT' });

      const req = new NextRequest(`http://localhost:3000/api/agents/${agentId}/draft`, {
        method: 'POST',
        headers: { host: 'localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      const res = await POST(req, routeParams);
      expect(res.status).toBe(201);
      expect(mockTenantRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: `/v1/agents/${agentId}/drafts`,
          body: { configuration: DEFAULT_AGENT_CONFIGURATION_V1 },
        }),
      );
    });

    it('returns 409 when draft already exists in backend', async () => {
      const error = Object.assign(new Error('Draft conflict'), {
        status: 409,
        data: { error: { code: 'CONFLICT', message: 'Existing draft' } },
      });
      mockTenantRequest.mockRejectedValue(error);

      const req = new NextRequest(`http://localhost:3000/api/agents/${agentId}/draft`, {
        method: 'POST',
        headers: { host: 'localhost:3000' },
      });

      const res = await POST(req, routeParams);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe('CONFLICT');
      expect(data.error).toBe('Já existe um rascunho ativo para este agente.');
    });
  });

  describe('PATCH /api/agents/[agentId]/draft (Update Draft Configuration)', () => {
    it('returns 400 when versionId query parameter is missing', async () => {
      const req = new NextRequest(`http://localhost:3000/api/agents/${agentId}/draft`, {
        method: 'PATCH',
        headers: { host: 'localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({ configuration: DEFAULT_AGENT_CONFIGURATION_V1 }),
      });

      const res = await PATCH(req, routeParams);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    it('strictly rejects extra fields like organizationId or role with 400', async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/agents/${agentId}/draft?versionId=${versionId}`,
        {
          method: 'PATCH',
          headers: { host: 'localhost:3000', 'content-type': 'application/json' },
          body: JSON.stringify({
            configuration: DEFAULT_AGENT_CONFIGURATION_V1,
            organizationId: 'malicious-org-id',
            role: 'OWNER',
          }),
        },
      );

      const res = await PATCH(req, routeParams);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    it('updates draft successfully with valid payload', async () => {
      mockTenantRequest.mockResolvedValue({ id: versionId, versionNumber: 2, status: 'DRAFT' });

      const req = new NextRequest(
        `http://localhost:3000/api/agents/${agentId}/draft?versionId=${versionId}`,
        {
          method: 'PATCH',
          headers: { host: 'localhost:3000', 'content-type': 'application/json' },
          body: JSON.stringify({
            configuration: DEFAULT_AGENT_CONFIGURATION_V1,
            changelog: 'Atualização de teste',
          }),
        },
      );

      const res = await PATCH(req, routeParams);
      expect(res.status).toBe(200);
      expect(mockTenantRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          path: `/v1/agents/${agentId}/drafts/${versionId}`,
          body: {
            configuration: DEFAULT_AGENT_CONFIGURATION_V1,
            changelog: 'Atualização de teste',
          },
        }),
      );
    });

    it('rejects invalid canonical tool identity in draft configuration with 400', async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/agents/${agentId}/draft?versionId=${versionId}`,
        {
          method: 'PATCH',
          headers: { host: 'localhost:3000', 'content-type': 'application/json' },
          body: JSON.stringify({
            configuration: {
              ...DEFAULT_AGENT_CONFIGURATION_V1,
              tools: ['unauthorized_or_unknown_tool'],
            },
          }),
        },
      );

      const res = await PATCH(req, routeParams);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    it('rejects duplicate canonical tool identities in draft configuration with 400', async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/agents/${agentId}/draft?versionId=${versionId}`,
        {
          method: 'PATCH',
          headers: { host: 'localhost:3000', 'content-type': 'application/json' },
          body: JSON.stringify({
            configuration: {
              ...DEFAULT_AGENT_CONFIGURATION_V1,
              tools: ['agent.operating_hours', 'agent.operating_hours'],
            },
          }),
        },
      );

      const res = await PATCH(req, routeParams);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/agents/[agentId]/draft (Discard Draft)', () => {
    it('discards draft when versionId is provided', async () => {
      mockTenantRequest.mockResolvedValue({ success: true });

      const req = new NextRequest(
        `http://localhost:3000/api/agents/${agentId}/draft?versionId=${versionId}`,
        {
          method: 'DELETE',
          headers: { host: 'localhost:3000' },
        },
      );

      const res = await DELETE(req, routeParams);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockTenantRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          path: `/v1/agents/${agentId}/drafts/${versionId}`,
        }),
      );
    });
  });
});
