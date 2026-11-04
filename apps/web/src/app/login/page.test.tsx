import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from 'next/navigation';
import { auth } from '../../lib/auth/auth.js';
import { activeOrganizationContextResolver } from '../../lib/organization/active-organization-context-resolver.js';
import { getInternalApiClient } from '../../lib/api/api-client-factory.js';
import { OVERVIEW } from '../../features/operations-overview/fixtures/overview-fixture.js';
import LoginPage from './page.js';
import DashboardPage from '../dashboard/page.js';

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  usePathname: () => '/login',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('../../preferences/ui-preferences-context.js', () => ({
  useUiPreferences: () => ({ sidebarCollapsed: false, toggleSidebar: vi.fn() }),
}));
vi.mock('../../lib/auth/auth.js', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('../../lib/auth/auth-client.js', () => ({ authClient: { signIn: { email: vi.fn() } } }));
vi.mock('../../lib/organization/active-organization-context-resolver.js', () => ({
  activeOrganizationContextResolver: { resolve: vi.fn() },
}));
vi.mock('../../lib/api/api-client-factory.js', () => ({
  getBootstrapApiClient: vi.fn(() => ({})),
  getInternalApiClient: vi.fn(),
}));

const ORG_A = { organizationId: 'org-a-id', slug: 'org-a', name: 'Org A', role: 'MANAGER' };
const ORG_B = { organizationId: 'org-b-id', slug: 'org-b', name: 'Org B', role: 'OWNER' };

function session(present: boolean) {
  vi.mocked(auth.api.getSession).mockResolvedValue(
    (present ? { user: { id: 'usr-1', email: 'u@example.com', name: 'U' } } : null) as never,
  );
}

function resolvesTo(status: 'RESOLVED' | 'NO_ORGANIZATIONS') {
  vi.mocked(activeOrganizationContextResolver.resolve).mockResolvedValue(
    (status === 'RESOLVED'
      ? { status, context: ORG_A, availableOrganizations: [ORG_A, ORG_B] }
      : { status, availableOrganizations: [] }) as never,
  );
}

const html = async (page: Promise<React.ReactElement | null>) =>
  renderToString((await page)!).replaceAll('<!-- -->', '');

describe('/login (public) and the protected /dashboard', () => {
  beforeEach(() => vi.resetAllMocks());

  it('renders the login form without a session and does not redirect', async () => {
    session(false);
    const out = await html(LoginPage());
    expect(out).toContain('data-testid="login-form"');
    expect(out).toContain('type="email"');
    expect(out).toContain('type="password"');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('dashboard sends unauthenticated users to /login', async () => {
    session(false);
    expect(await DashboardPage()).toBeNull();
    expect(redirect).toHaveBeenCalledWith('/login');
    expect(activeOrganizationContextResolver.resolve).not.toHaveBeenCalled();
  });

  it('with a session, /login goes to /dashboard and /dashboard does not go back (no cycle)', async () => {
    session(true);
    resolvesTo('NO_ORGANIZATIONS');
    expect(await LoginPage()).toBeNull();
    expect(vi.mocked(redirect).mock.calls).toEqual([['/dashboard']]);
    vi.mocked(redirect).mockClear();
    const out = await html(DashboardPage());
    expect(out).toContain('Nenhuma organização ativa');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('an authenticated user enters the dashboard of the server-resolved organization only', async () => {
    session(true);
    resolvesTo('RESOLVED');
    const request = vi.fn(async ({ path }: { path: string }) =>
      path.startsWith('/v1/operations/overview') ? OVERVIEW : [],
    );
    vi.mocked(getInternalApiClient).mockReturnValue({ request } as never);
    const out = await html(DashboardPage());
    expect(redirect).not.toHaveBeenCalled();
    expect(out).toContain('data-testid="kpi-attempts"');
    // Usuário vem da sessão; organização vem do resolvedor do servidor.
    expect(vi.mocked(activeOrganizationContextResolver.resolve).mock.calls[0]![0]).toMatchObject({
      userId: 'usr-1',
    });
    for (const [options] of request.mock.calls as unknown as [Record<string, string>][]) {
      expect(options).toMatchObject({ userId: 'usr-1', organizationId: 'org-a-id' });
    }
    expect(out).toContain('/orgs/org-a/');
    expect(out).not.toContain('/orgs/org-b/');
  });
});
