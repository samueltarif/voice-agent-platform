import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { auth } from '../../../../lib/auth/auth.js';
import { switchOrganizationService } from '../../../../lib/organization/switch-organization-service.js';
import { POST } from './route.js';

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

const mockSession: SessionResult = {
  user: {
    id: 'user-1',
    email: 'user-1@example.com',
    name: 'User 1',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  session: {
    id: 'sess-1',
    userId: 'user-1',
    expiresAt: new Date(Date.now() + 3600000),
    token: 'test-token',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

vi.mock('../../../../lib/auth/auth.js', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('../../../../lib/api/api-client-factory.js', () => ({
  getBootstrapApiClient: vi.fn(() => ({})),
}));

vi.mock('../../../../lib/organization/switch-organization-service.js', () => ({
  switchOrganizationService: {
    switchOrganization: vi.fn(),
  },
}));

describe('POST /api/organization/switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects cross-origin requests with 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/organization/switch', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://evil-attacker.com',
      },
      body: JSON.stringify({ slug: 'acme-corp' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('Origem da requisição não autorizada');
  });

  it('rejects unauthenticated requests with 401', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost:3000/api/organization/switch', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ slug: 'acme-corp' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('não autenticada');
  });

  it('rejects invalid JSON with 400', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(mockSession);

    const req = new NextRequest('http://localhost:3000/api/organization/switch', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: 'invalid-json-body',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when switchOrganizationService rejects inaccessible organization', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(mockSession);

    vi.mocked(switchOrganizationService.switchOrganization).mockResolvedValueOnce({
      success: false,
      error: 'Organização não encontrada ou acesso não autorizado.',
    });

    const req = new NextRequest('http://localhost:3000/api/organization/switch', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ slug: 'secret-corp' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('Organização não encontrada ou acesso não autorizado.');
  });

  it('successfully authorizes switch and sets HttpOnly cookie on response', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(mockSession);

    vi.mocked(switchOrganizationService.switchOrganization).mockResolvedValueOnce({
      success: true,
      organization: {
        slug: 'acme-corp',
        name: 'Acme Corporation',
      },
    });

    const req = new NextRequest('http://localhost:3000/api/organization/switch', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ slug: 'acme-corp' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.organization).toEqual({
      slug: 'acme-corp',
      name: 'Acme Corporation',
    });

    // Verify cookie was set
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('active_organization_slug=acme-corp');
    expect(setCookie?.toLowerCase()).toContain('httponly');
    expect(setCookie?.toLowerCase()).toContain('samesite=lax');
  });
});
