import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerOrganizationContext } from '../../../lib/organization/server-organization-context.js';
import { getInternalApiClient } from '../../../lib/api/api-client-factory.js';
import { GET, POST } from './route.js';

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
      headers: { host: 'localhost:3000', origin: 'http://attacker.com' },
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

describe('POST /api/agents (BFF Tenant Proxy)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects cross-origin requests with 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: { host: 'localhost:3000', origin: 'http://evil.com' },
      body: JSON.stringify({ name: 'Test', slug: 'test' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'UNAUTHENTICATED',
      availableOrganizations: [],
    });

    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
      body: JSON.stringify({ name: 'Test', slug: 'test' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('denies creation for non-create roles (VIEWER, MANAGER, OPERATOR)', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'org-a',
        name: 'Org A',
        role: 'VIEWER',
      },
      availableOrganizations: [],
      user: { id: 'usr-1', email: 'v@example.com' },
    });

    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
      body: JSON.stringify({ name: 'Test', slug: 'test' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('FORBIDDEN');
  });

  it('rejects extra fields like organizationId or role due to strict contract', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'org-a',
        name: 'Org A',
        role: 'ADMIN',
      },
      availableOrganizations: [],
      user: { id: 'usr-1', email: 'a@example.com' },
    });

    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
      body: JSON.stringify({
        name: 'Spoofed Agent',
        slug: 'spoofed-agent',
        organizationId: 'org-victim',
        role: 'OWNER',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('VALIDATION_ERROR');
  });

  it('successfully creates agent when role is ADMIN', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'org-a',
        name: 'Org A',
        role: 'ADMIN',
      },
      availableOrganizations: [],
      user: { id: 'usr-1', email: 'a@example.com' },
    });

    const createdAgent = { id: 'ag-1', name: 'Alpha', slug: 'alpha', status: 'ACTIVE' };
    const mockRequest = vi.fn().mockResolvedValueOnce(createdAgent);
    vi.mocked(getInternalApiClient).mockReturnValueOnce({
      request: mockRequest,
    } as never);

    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
      body: JSON.stringify({ name: 'Alpha', slug: 'alpha' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual(createdAgent);
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v1/agents',
        organizationId: 'org-1',
        userId: 'usr-1',
        body: { name: 'Alpha', slug: 'alpha' },
      }),
    );
  });

  it('maps backend ENTITLEMENT_EXCEEDED error to 403', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'org-a',
        name: 'Org A',
        role: 'OWNER',
      },
      availableOrganizations: [],
      user: { id: 'usr-1', email: 'o@example.com' },
    });

    const error = new Error('Quota exceeded');
    Object.assign(error, {
      status: 403,
      data: { error: { code: 'ENTITLEMENT_EXCEEDED', message: 'Quota exceeded' } },
    });

    vi.mocked(getInternalApiClient).mockReturnValueOnce({
      request: vi.fn().mockRejectedValueOnce(error),
    } as never);

    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
      body: JSON.stringify({ name: 'Over Quota', slug: 'over-quota' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('ENTITLEMENT_EXCEEDED');
    expect(data.error).toContain('Limite de agentes atingido');
  });

  it('maps backend CONFLICT error to 409', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'org-a',
        name: 'Org A',
        role: 'OWNER',
      },
      availableOrganizations: [],
      user: { id: 'usr-1', email: 'o@example.com' },
    });

    const error = new Error('Agent already exists');
    Object.assign(error, {
      status: 409,
      data: { error: { code: 'CONFLICT', message: 'Agent already exists' } },
    });

    vi.mocked(getInternalApiClient).mockReturnValueOnce({
      request: vi.fn().mockRejectedValueOnce(error),
    } as never);

    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
      body: JSON.stringify({ name: 'Dup', slug: 'dup' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe('CONFLICT');
    expect(data.error).toContain('Já existe um agente com este slug');
  });
});
