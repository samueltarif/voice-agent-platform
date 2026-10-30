import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notFound, redirect } from 'next/navigation';
import { getServerOrganizationContext } from '../../../../../../lib/organization/server-organization-context.js';
import { getInternalApiClient } from '../../../../../../lib/api/api-client-factory.js';
import CampaignReportPage from './page.js';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  usePathname: () => '/orgs/org-a/campaigns',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('../../../../../../preferences/ui-preferences-context.js', () => ({
  useUiPreferences: () => ({ sidebarCollapsed: false, toggleSidebar: vi.fn() }),
}));
vi.mock('../../../../../../lib/organization/server-organization-context.js', () => ({
  getServerOrganizationContext: vi.fn(),
}));
vi.mock('../../../../../../lib/api/api-client-factory.js', () => ({
  getInternalApiClient: vi.fn(),
}));

const ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const load = (orgSlug: string, campaignId = ID) =>
  CampaignReportPage({ params: Promise.resolve({ orgSlug, campaignId }) });

function resolved() {
  vi.mocked(getServerOrganizationContext).mockResolvedValue({
    status: 'RESOLVED',
    context: { organizationId: 'org-1', slug: 'org-a', name: 'Org A', role: 'VIEWER' },
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

describe('008-MVP4 campaign report page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('redirects to /login without a session and to the canonical org slug', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'UNAUTHENTICATED',
      availableOrganizations: [],
    });
    expect(await load('org-a')).toBeNull();
    expect(redirect).toHaveBeenCalledWith('/login');
    resolved();
    const request = api(() => []);
    expect(await load('evil')).toBeNull();
    expect(redirect).toHaveBeenCalledWith(`/orgs/org-a/campaigns/${ID}/report`);
    expect(request).not.toHaveBeenCalled();
  });

  it('answers notFound for invalid ids and campaigns of other tenants', async () => {
    resolved();
    const request = api(() => Object.assign(new Error('nf'), { status: 404 }));
    await expect(load('org-a', '../x')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(request).not.toHaveBeenCalled();
    await expect(load('org-a')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledTimes(2);
  });

  it('loads one extra attempt to detect the next page and shows an explicit error on failure', async () => {
    resolved();
    const request = api(() => Object.assign(new Error('boom'), { status: 500 }));
    const html = renderToString((await load('org-a'))!);
    expect(html).toContain('Não foi possível carregar o relatório.');
    expect(request.mock.calls.map(([o]) => o.path)).toContain(
      `/v1/campaigns/${ID}/attempts?limit=26`,
    );
  });
});
