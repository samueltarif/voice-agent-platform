import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notFound, redirect } from 'next/navigation';
import { getServerOrganizationContext } from '../../../../lib/organization/server-organization-context.js';
import { getInternalApiClient } from '../../../../lib/api/api-client-factory.js';
import CampaignsPage from './page.js';
import CampaignPage from './[campaignId]/page.js';
import ContactsPage from '../contacts/page.js';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  usePathname: () => '/orgs/org-a/campaigns',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('../../../../lib/organization/server-organization-context.js', () => ({
  getServerOrganizationContext: vi.fn(),
}));
vi.mock('../../../../preferences/ui-preferences-context.js', () => ({
  useUiPreferences: () => ({ sidebarCollapsed: false, toggleSidebar: vi.fn() }),
}));
vi.mock('../../../../lib/api/api-client-factory.js', () => ({ getInternalApiClient: vi.fn() }));

const ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

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

const pages = [
  ['campaigns', () => CampaignsPage({ params: Promise.resolve({ orgSlug: 'evil' }) })],
  ['contacts', () => ContactsPage({ params: Promise.resolve({ orgSlug: 'evil' }) })],
  [
    `campaigns/${ID}`,
    () => CampaignPage({ params: Promise.resolve({ orgSlug: 'evil', campaignId: ID }) }),
  ],
] as const;

describe('008-MVP2 operations pages: guards', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each(pages)('%s → /login without a session', async (_segment, load) => {
    vi.mocked(getServerOrganizationContext).mockResolvedValue({
      status: 'UNAUTHENTICATED',
      availableOrganizations: [],
    });
    expect(await load()).toBeNull();
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it.each(pages)('%s → canonical slug when the URL names another org', async (segment, load) => {
    resolved();
    const request = api(() => []);
    expect(await load()).toBeNull();
    expect(redirect).toHaveBeenCalledWith(`/orgs/org-a/${segment}`);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('008-MVP2 operations pages: data', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does not load agents (create form) for roles that cannot operate campaigns', async () => {
    resolved('VIEWER');
    const request = api(() => []);
    await CampaignsPage({ params: Promise.resolve({ orgSlug: 'org-a' }) });
    expect(request.mock.calls.map(([o]) => o.path)).toEqual(['/v1/campaigns?limit=100']);
  });

  it('answers notFound for invalid ids and for campaigns of other tenants (API 404)', async () => {
    resolved();
    const request = api((path) =>
      path.startsWith('/v1/campaigns') ? Object.assign(new Error('nf'), { status: 404 }) : [],
    );
    await expect(
      CampaignPage({ params: Promise.resolve({ orgSlug: 'org-a', campaignId: 'x/../y' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(request).not.toHaveBeenCalled();
    await expect(
      CampaignPage({ params: Promise.resolve({ orgSlug: 'org-a', campaignId: ID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledTimes(2);
  });

  it('shows an explicit load error (never placeholder data) when the API fails', async () => {
    resolved('OWNER');
    api(() => Object.assign(new Error('boom'), { status: 500 }));
    const page = await ContactsPage({ params: Promise.resolve({ orgSlug: 'org-a' }) });
    const html = renderToString(page!);
    expect(html).toContain('Não foi possível carregar os contatos.');
    expect(html).not.toContain('contact-lists-panel');
  });
});
