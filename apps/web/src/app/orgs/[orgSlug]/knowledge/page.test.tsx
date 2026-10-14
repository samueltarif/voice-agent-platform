import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from 'next/navigation';
import { getServerOrganizationContext } from '../../../../lib/organization/server-organization-context.js';
import KnowledgePage from './page.js';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  usePathname: () => '/orgs/acme-corp/knowledge',
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

describe('KnowledgePage Route Guards (server-side role resolution)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /login when unauthenticated', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'UNAUTHENTICATED',
      availableOrganizations: [],
    });

    await KnowledgePage({ params: Promise.resolve({ orgSlug: 'acme-corp' }) });
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('redirects to /dashboard when user has no active organization', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'NO_ORGANIZATIONS',
      availableOrganizations: [],
    });

    await KnowledgePage({ params: Promise.resolve({ orgSlug: 'acme-corp' }) });
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('redirects to canonical active org when URL slug does not match', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: { organizationId: 'org-1', slug: 'active-org', name: 'Active Org', role: 'ADMIN' },
      availableOrganizations: [],
      user: { id: 'usr-1', email: 'u@example.com' },
    });

    await KnowledgePage({ params: Promise.resolve({ orgSlug: 'acme-corp' }) });
    expect(redirect).toHaveBeenCalledWith('/orgs/active-org/knowledge');
  });
});
