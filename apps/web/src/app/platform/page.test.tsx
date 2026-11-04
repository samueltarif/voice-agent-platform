import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notFound, redirect } from 'next/navigation';
import { auth } from '../../lib/auth/auth.js';
import PlatformPage from './page.js';

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  usePathname: () => '/platform',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('../../preferences/ui-preferences-context.js', () => ({
  useUiPreferences: () => ({ sidebarCollapsed: false, toggleSidebar: vi.fn() }),
}));
vi.mock('../../lib/auth/auth.js', () => ({ auth: { api: { getSession: vi.fn() } } }));

describe('/platform is a demo preview without real administrative access', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('does not exist in production (404) and does not even read the session', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(await PlatformPage()).toBeNull();
    expect(notFound).toHaveBeenCalled();
    expect(auth.api.getSession).not.toHaveBeenCalled();
  });

  it('requires a session outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    expect(await PlatformPage()).toBeNull();
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('labels the preview as demo data and disables the report actions', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'usr-1' } } as never);
    const html = renderToString((await PlatformPage())!);
    expect(html).toContain('data-testid="platform-demo-banner"');
    expect(html).toContain('Modo demonstração.');
    expect(html.match(/disabled=""/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(redirect).not.toHaveBeenCalled();
  });
});
