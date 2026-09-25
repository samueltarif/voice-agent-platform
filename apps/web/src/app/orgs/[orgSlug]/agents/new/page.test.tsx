import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from 'next/navigation';
import { getServerOrganizationContext } from '../../../../../lib/organization/server-organization-context.js';
import AgentNewPage from './page.js';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  usePathname: () => '/orgs/active-org/agents/new',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('../../../../../preferences/ui-preferences-context.js', () => ({
  useUiPreferences: () => ({
    sidebarCollapsed: false,
    toggleSidebar: vi.fn(),
    theme: 'dark',
    setTheme: vi.fn(),
    density: 'default',
    setDensity: vi.fn(),
  }),
}));

vi.mock('../../../../../lib/organization/server-organization-context.js', () => ({
  getServerOrganizationContext: vi.fn(),
}));

describe('AgentNewPage (Server Component Route)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /login when unauthenticated', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'UNAUTHENTICATED',
      availableOrganizations: [],
    });

    await AgentNewPage({ params: Promise.resolve({ orgSlug: 'active-org' }) });
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('redirects to active org when URL slug does not match active org', async () => {
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

    await AgentNewPage({ params: Promise.resolve({ orgSlug: 'other-slug' }) });
    expect(redirect).toHaveBeenCalledWith('/orgs/active-org/agents/new');
  });

  it('renders restricted access card when user has non-create role (e.g. VIEWER)', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'active-org',
        name: 'Active Org',
        role: 'VIEWER',
      },
      availableOrganizations: [],
      user: { id: 'usr-1', email: 'v@example.com' },
    });

    const element = await AgentNewPage({ params: Promise.resolve({ orgSlug: 'active-org' }) });
    const html = renderToString(element!);

    expect(html).toContain('Acesso Restrito');
    expect(html).toContain('Você não possui permissão para criar agentes nesta organização');
    expect(html).not.toContain('Salvar e criar');
  });

  it('renders create form when user has OWNER role', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'active-org',
        name: 'Active Org',
        role: 'OWNER',
      },
      availableOrganizations: [],
      user: { id: 'usr-1', email: 'o@example.com' },
    });

    const element = await AgentNewPage({ params: Promise.resolve({ orgSlug: 'active-org' }) });
    const html = renderToString(element!);

    expect(html).toContain('Criar novo agente');
    expect(html).toContain('Salvar e criar');
    expect(html).toContain('agent-name');
    expect(html).toContain('agent-slug');
  });
});
