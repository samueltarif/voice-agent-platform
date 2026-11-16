import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentMetadataResponse } from '@voice-agent/contracts';
import { getServerOrganizationContext } from '../../../../../../lib/organization/server-organization-context.js';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from '../../../../../../features/agents/agent-default-configuration.js';
import { loadAgentSimulatorData } from '../load-agent-detail-data.js';
import AgentSimulatorPage from './page.js';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  usePathname: () => '/orgs/active-org/agents/a0000000-0000-4000-8000-000000000001/simulador',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('../../../../../../preferences/ui-preferences-context.js', () => ({
  useUiPreferences: () => ({
    sidebarCollapsed: false,
    toggleSidebar: vi.fn(),
    theme: 'dark',
    setTheme: vi.fn(),
    density: 'default',
    setDensity: vi.fn(),
  }),
}));
vi.mock('../../../../../../lib/organization/server-organization-context.js', () => ({
  getServerOrganizationContext: vi.fn(),
}));
vi.mock('../load-agent-detail-data.js', () => ({ loadAgentSimulatorData: vi.fn() }));

const AGENT_ID = 'a0000000-0000-4000-8000-000000000001';
const AGENT: AgentMetadataResponse = {
  id: AGENT_ID,
  name: 'ASSISTENTE DE VENDAS',
  slug: 'assistente-de-vendas',
  status: 'ACTIVE',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-21T12:00:00.000Z',
  currentPublishedVersionNumber: 3,
};
const PUBLISHED_VERSION = { id: 'v3', versionNumber: 3, status: 'PUBLISHED' };
const CONFIG = { ...DEFAULT_AGENT_CONFIGURATION_V1, tools: ['knowledge.search' as const] };

function asRole(role: string) {
  vi.mocked(getServerOrganizationContext).mockResolvedValue({
    status: 'RESOLVED',
    context: { organizationId: 'org-1', slug: 'active-org', name: 'Qualitec', role },
    user: { id: 'user-1', email: 'u@example.test', name: 'U' },
    availableOrganizations: [],
  } as never);
}

function loaded(overrides: Record<string, unknown> = {}) {
  vi.mocked(loadAgentSimulatorData).mockResolvedValue({
    agent: AGENT,
    versions: [PUBLISHED_VERSION],
    draftVersion: null,
    draftConfig: null,
    publishedConfig: CONFIG,
    isNotFound: false,
    errorMessage: null,
    ...overrides,
  } as never);
}

const render = async () =>
  renderToString(
    (await AgentSimulatorPage({
      params: Promise.resolve({ orgSlug: 'active-org', agentId: AGENT_ID }),
      searchParams: Promise.resolve({}),
    }))!,
  );

/** DEC-061 — a conversa só aparece para agente ativo com versão publicada e papel autorizado. */
describe('AgentSimulatorPage — simulated conversation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the conversation for an active agent with a published version', async () => {
    asRole('MANAGER');
    loaded();
    const html = await render();
    expect(html).toContain('data-testid="simulator-conversation"');
    expect(html).toContain('Agente: ASSISTENTE DE VENDAS · Versão publicada nº 3');
  });

  it('hides it without a published version, for archived agents and for roles without access', async () => {
    asRole('ADMIN');
    loaded({ versions: [{ id: 'v1', versionNumber: 1, status: 'DRAFT' }], publishedConfig: null });
    expect(await render()).not.toContain('simulator-conversation');
    loaded({ agent: { ...AGENT, status: 'ARCHIVED' } });
    expect(await render()).not.toContain('simulator-conversation');
    asRole('VIEWER');
    loaded();
    expect(await render()).not.toContain('simulator-conversation');
  });
});
