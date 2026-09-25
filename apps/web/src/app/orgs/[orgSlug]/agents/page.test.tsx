import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from 'next/navigation';
import { getServerOrganizationContext } from '../../../../lib/organization/server-organization-context.js';
import { getInternalApiClient } from '../../../../lib/api/api-client-factory.js';
import AgentsPage from './page.js';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  usePathname: () => '/orgs/acme-corp/agents',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('../../../../preferences/ui-preferences-context.js', () => ({
  useUiPreferences: () => ({
    sidebarCollapsed: false,
    toggleSidebar: vi.fn(),
    theme: 'dark',
    setTheme: vi.fn(),
    density: 'default',
    setDensity: vi.fn(),
  }),
}));

vi.mock('../../../../lib/organization/server-organization-context.js', () => ({
  getServerOrganizationContext: vi.fn(),
}));

vi.mock('../../../../lib/api/api-client-factory.js', () => ({
  getInternalApiClient: vi.fn(),
}));

describe('AgentsPage Route Guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /login when unauthenticated', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'UNAUTHENTICATED',
      availableOrganizations: [],
    });

    await AgentsPage({ params: Promise.resolve({ orgSlug: 'acme-corp' }) });
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('redirects to /dashboard when user has no active organization', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'NO_ORGANIZATIONS',
      availableOrganizations: [],
    });

    await AgentsPage({ params: Promise.resolve({ orgSlug: 'acme-corp' }) });
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('redirects to canonical active org when URL slug does not match active org', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'active-org',
        name: 'Active Org',
        role: 'ADMIN',
      },
      availableOrganizations: [],
      user: { id: 'usr-1', email: 'u@example.com' },
    });

    await AgentsPage({ params: Promise.resolve({ orgSlug: 'tampered-slug' }) });
    expect(redirect).toHaveBeenCalledWith('/orgs/active-org/agents');
  });
});

describe('AgentsPage Data Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders agents list and create button when user is ADMIN of active org', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'active-org',
        name: 'Active Org',
        role: 'ADMIN',
      },
      availableOrganizations: [
        { id: 'org-1', slug: 'active-org', name: 'Active Org', role: 'ADMIN' },
      ],
      user: { id: 'usr-1', email: 'u@example.com' },
    });

    const mockRequest = vi.fn().mockResolvedValueOnce([
      {
        id: 'ag-1',
        name: 'Agente Ativo',
        slug: 'agente-ativo',
        status: 'ACTIVE',
        createdAt: '2026-09-20T10:00:00.000Z',
        updatedAt: '2026-09-21T12:00:00.000Z',
        currentPublishedVersionNumber: 1,
      },
    ]);
    vi.mocked(getInternalApiClient).mockReturnValueOnce({ request: mockRequest } as never);

    const element = await AgentsPage({ params: Promise.resolve({ orgSlug: 'active-org' }) });
    const html = renderToString(element!);

    expect(html).toContain('Agentes');
    expect(html).toContain('Agente Ativo');
    expect(html).toContain('agente-ativo');
    expect(html).toContain('Criar agente');
  });

  it('renders error card when TenantApiClient request fails', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'active-org',
        name: 'Active Org',
        role: 'ADMIN',
      },
      availableOrganizations: [],
      user: { id: 'usr-1', email: 'u@example.com' },
    });

    vi.mocked(getInternalApiClient).mockReturnValueOnce({
      request: vi.fn().mockRejectedValueOnce(new Error('Network error')),
    } as never);

    const element = await AgentsPage({ params: Promise.resolve({ orgSlug: 'active-org' }) });
    const html = renderToString(element!);

    expect(html).toContain('Não foi possível carregar os agentes');
  });
});
