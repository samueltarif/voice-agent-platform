import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from 'next/navigation';
import { getServerOrganizationContext } from '../../lib/organization/server-organization-context.js';
import { getInternalApiClient } from '../../lib/api/api-client-factory.js';
import { OVERVIEW } from '../../features/operations-overview/fixtures/overview-fixture.js';
import DashboardPage from './page.js';
import CallsPage from '../calls/page.js';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('../../preferences/ui-preferences-context.js', () => ({
  useUiPreferences: () => ({ sidebarCollapsed: false, toggleSidebar: vi.fn() }),
}));
vi.mock('../../lib/organization/server-organization-context.js', () => ({
  getServerOrganizationContext: vi.fn(),
}));
vi.mock('../../lib/api/api-client-factory.js', () => ({ getInternalApiClient: vi.fn() }));

function resolved(role = 'MANAGER') {
  vi.mocked(getServerOrganizationContext).mockResolvedValue({
    status: 'RESOLVED',
    context: { organizationId: 'org-1', slug: 'org-a', name: 'Org A', role: role as never },
    availableOrganizations: [],
    user: { id: 'usr-1', email: 'u@example.com' },
  });
}

function api(handler: (path: string) => unknown) {
  const request = vi.fn(async ({ path }: { path: string }) => {
    const value = handler(path);
    if (value instanceof Error) throw value;
    return value;
  });
  vi.mocked(getInternalApiClient).mockReturnValue({ request } as never);
  return request;
}

const render = async (page: Promise<React.ReactElement | null>) =>
  renderToString((await page)!).replaceAll('<!-- -->', '');

describe('008-MVP4c /dashboard and /calls from persisted data', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ['dashboard', () => DashboardPage()],
    ['calls', () => CallsPage()],
  ])('%s: redirects to /login without a session', async (_name, load) => {
    vi.mocked(getServerOrganizationContext).mockResolvedValue({
      status: 'UNAUTHENTICATED',
      availableOrganizations: [],
    });
    expect(await load()).toBeNull();
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it.each([
    ['dashboard', () => DashboardPage()],
    ['calls', () => CallsPage()],
  ])(
    '%s: shows an explicit empty state without organization (no redirect loop)',
    async (_n, load) => {
      vi.mocked(getServerOrganizationContext).mockResolvedValue({
        status: 'NO_ORGANIZATIONS',
        availableOrganizations: [],
      });
      const request = api(() => null);
      const out = await render(load());
      expect(out).toContain('Nenhuma organização ativa');
      expect(redirect).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('dashboard renders the real overview of the active organization only', async () => {
    resolved();
    const request = api((path) => (path.startsWith('/v1/operations/overview') ? OVERVIEW : []));
    const out = await render(DashboardPage());
    expect(request.mock.calls.map(([o]) => o.path)).toEqual([
      '/v1/operations/overview?days=7',
      '/v1/operations/attempts?days=7&limit=26',
    ]);
    expect(out).toContain('data-testid="kpi-attempts">4<');
    expect(out).toContain('report-costs-restricted');
    expect(out).toContain('/orgs/org-a/contacts');
    expect(out).toContain('/orgs/org-a/campaigns');
    expect(out).not.toMatch(/Qualificado|Transcrição|Aguardando humano/);
  });

  it('dashboard shows an explicit error instead of placeholder data when the API fails', async () => {
    resolved();
    api(() => Object.assign(new Error('boom'), { status: 500 }));
    const out = await render(DashboardPage());
    expect(out).toContain('Não foi possível carregar os dados operacionais.');
    expect(out).not.toContain('kpi-attempts');
  });

  it('calls lists real attempts of the last 30 days and says transcripts are not stored', async () => {
    resolved('VIEWER');
    const request = api(() => []);
    const out = await render(CallsPage());
    expect(request.mock.calls.map(([o]) => o.path)).toEqual([
      '/v1/operations/attempts?days=30&limit=26',
    ]);
    expect(out).toContain('calls-availability-notice');
    expect(out).toContain('attempts-empty');
  });

  it('calls shows an explicit error when the API fails', async () => {
    resolved();
    api(() => Object.assign(new Error('boom'), { status: 500 }));
    expect(await render(CallsPage())).toContain('Não foi possível carregar as tentativas.');
  });
});
