import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as clientFactory from '../../../../../lib/api/api-client-factory.js';
import { InternalApiClient } from '../../../../../lib/api/internal-api-client.js';
import { getServerOrganizationContext } from '../../../../../lib/organization/server-organization-context.js';
import AgentDetailPage from './page.js';
import AgentSimulatorPage from './simulador/page.js';

/**
 * NB-2 (revisão da #148): nas páginas do detalhe e do simulador, sessão, organização e
 * RBAC precedem o uso do agentId. Resolvedor e loaders reais; só a sessão, o redirect
 * e o fetch são simulados. Nenhuma recusa pode gerar chamada de rede, e o redirecionamento
 * para a organização ativa nunca carrega o id hostil.
 */
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock('../../../../../lib/organization/server-organization-context.js', () => ({
  getServerOrganizationContext: vi.fn(),
}));
vi.mock('../../../../../lib/api/api-client-factory.js');

const BASE = 'http://api.internal:3002';
const AGENT = 'a0000000-0000-4000-8000-000000000001';
const HOSTILE = ['../../v1/organizations', '..', '%2e%2e', 'a/b', 'a\\b', `${AGENT}/x`];
const fetchFn = vi.fn(async () => new Response('{}', { status: 404 }));
const { privateKey } = generateKeyPairSync('ed25519');

type Page = (props: never) => Promise<unknown>;
const PAGES: [string, Page, string][] = [
  ['detail', AgentDetailPage as Page, ''],
  ['simulator', AgentSimulatorPage as Page, '/simulador'],
];

function session(status: 'UNAUTHENTICATED' | 'NO_ACTIVE' | 'RESOLVED', role = 'ADMIN'): void {
  vi.mocked(getServerOrganizationContext).mockResolvedValue({
    status,
    availableOrganizations: [],
    ...(status === 'RESOLVED'
      ? {
          context: { organizationId: 'org-1', slug: 'active-org', name: 'Org', role },
          user: { id: 'user-1', email: 'u@example.test' },
        }
      : {}),
  } as never);
}

function open(page: Page, orgSlug: string, agentId: string): Promise<unknown> {
  return page({
    params: Promise.resolve({ orgSlug, agentId }),
    searchParams: Promise.resolve({}),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clientFactory.getInternalApiClient).mockReturnValue(
    new InternalApiClient({
      baseUrl: BASE,
      privateJwk: privateKey.export({ format: 'jwk' }),
      kid: 'k1',
      fetchFn,
    }),
  );
});

describe('agent pages — security precedence with hostile agentId (NB-2)', () => {
  it.each(PAGES)('%s: missing session redirects to login first', async (_n, page) => {
    session('UNAUTHENTICATED');
    for (const id of HOSTILE)
      await expect(open(page, 'active-org', id)).rejects.toThrow('REDIRECT:/login');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(PAGES)('%s: no active organization redirects to dashboard', async (_n, page) => {
    session('NO_ACTIVE');
    for (const id of HOSTILE)
      await expect(open(page, 'active-org', id)).rejects.toThrow('REDIRECT:/dashboard');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(PAGES)(
    '%s: other organization slug never echoes the hostile id',
    async (_n, page, suffix) => {
      session('RESOLVED');
      for (const id of HOSTILE) {
        await expect(open(page, 'other-org', id)).rejects.toThrow(
          /^REDIRECT:\/orgs\/active-org\/agents$/,
        );
      }
      await expect(open(page, 'other-org', AGENT)).rejects.toThrow(
        `REDIRECT:/orgs/active-org/agents/${AGENT}${suffix}`,
      );
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it.each(PAGES)(
    '%s: same organization with hostile id renders without any network call',
    async (_n, page) => {
      session('RESOLVED');
      for (const id of HOSTILE) expect(await open(page, 'active-org', id)).toBeTruthy();
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it('simulator: role without config access is refused before the agent is loaded', async () => {
    session('RESOLVED', 'OPERATOR');
    for (const id of [...HOSTILE, AGENT]) await open(AgentSimulatorPage as Page, 'active-org', id);
    expect(clientFactory.getInternalApiClient).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(PAGES)('%s: valid UUID queries only its own agent endpoint', async (_n, page) => {
    session('RESOLVED');
    await open(page, 'active-org', AGENT);
    const urls = fetchFn.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(urls).toEqual([`${BASE}/v1/agents/${AGENT}`]);
  });
});
