import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import type { AgentMetadataResponse } from '@voice-agent/contracts';
import { getServerOrganizationContext } from '../../../../../../lib/organization/server-organization-context.js';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from '../../../../../../features/agents/agent-default-configuration.js';
import { SIMULATOR_OFFLINE_LABEL } from '../../../../../../features/agents/simulator/simulator-offline-banner.js';
import { loadAgentSimulatorData } from '../load-agent-detail-data.js';
import AgentSimulatorPage, {
  SIMULATOR_FORBIDDEN_NOTICE,
  SIMULATOR_NOT_FOUND_NOTICE,
} from './page.js';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  usePathname: () => '/orgs/active-org/agents/agent-1/simulador',
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

const AGENT: AgentMetadataResponse = {
  id: 'agent-1',
  name: 'Agente de Vendas',
  slug: 'agente-de-vendas',
  status: 'ACTIVE',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-21T12:00:00.000Z',
  currentPublishedVersionNumber: 1,
};
const DRAFT = {
  ...DEFAULT_AGENT_CONFIGURATION_V1,
  persona: { ...DEFAULT_AGENT_CONFIGURATION_V1.persona, role: 'Papel rascunho' },
  tools: ['catalog.search' as const],
  playbook: { stages: [{ name: 'Etapa do rascunho', goal: 'Meta' }] },
};
const PUBLISHED = {
  ...DEFAULT_AGENT_CONFIGURATION_V1,
  tools: [],
  playbook: { stages: [{ name: 'Etapa publicada', goal: 'Meta' }] },
};

function asRole(role: string, slug = 'active-org') {
  vi.mocked(getServerOrganizationContext).mockResolvedValue({
    status: 'RESOLVED',
    context: { organizationId: 'org-1', slug, name: 'Organização Ativa', role },
    user: { id: 'user-1', email: 'u@example.test', name: 'U' },
    availableOrganizations: [],
  } as never);
}

function loaded(overrides: Record<string, unknown> = {}) {
  vi.mocked(loadAgentSimulatorData).mockResolvedValue({
    agent: AGENT,
    versions: [],
    draftVersion: null,
    draftConfig: DRAFT,
    publishedConfig: PUBLISHED,
    isNotFound: false,
    errorMessage: null,
    ...overrides,
  } as never);
}

const render = async (orgSlug = 'active-org', config?: string) =>
  renderToString(
    (await AgentSimulatorPage({
      params: Promise.resolve({ orgSlug, agentId: 'agent-1' }),
      searchParams: Promise.resolve(config ? { config } : {}),
    }))!,
  );

describe('AgentSimulatorPage — access and isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirects unauthenticated users and canonicalizes another org slug to the simulator', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'UNAUTHENTICATED',
      availableOrganizations: [],
    });
    await AgentSimulatorPage({
      params: Promise.resolve({ orgSlug: 'active-org', agentId: 'agent-1' }),
    });
    expect(redirect).toHaveBeenCalledWith('/login');
    asRole('ADMIN');
    await AgentSimulatorPage({
      params: Promise.resolve({ orgSlug: 'other-org', agentId: 'agent-1' }),
    });
    expect(redirect).toHaveBeenCalledWith('/orgs/active-org/agents/agent-1/simulador');
    expect(loadAgentSimulatorData).not.toHaveBeenCalled();
  });

  it('does not load or show configuration for roles without read permission', async () => {
    for (const role of ['MEMBER', 'VIEWER', 'AGENT']) {
      asRole(role);
      const html = await render();
      expect(html).toContain(SIMULATOR_FORBIDDEN_NOTICE);
      expect(html).toContain(SIMULATOR_OFFLINE_LABEL);
      expect(html).not.toContain('Etapa do rascunho');
    }
    expect(loadAgentSimulatorData).not.toHaveBeenCalled();
  });

  it('loads only through the active organization context for allowed roles', async () => {
    for (const role of ['OWNER', 'ADMIN', 'MANAGER']) {
      asRole(role);
      loaded();
      const html = await render();
      expect(html).toContain('Organização: Organização Ativa');
      expect(html).toContain('Etapa do rascunho');
    }
    const [context, userId, agentId] = vi.mocked(loadAgentSimulatorData).mock.calls[0]!;
    expect(context).toMatchObject({ organizationId: 'org-1', slug: 'active-org' });
    expect([userId, agentId]).toEqual(['user-1', 'agent-1']);
  });

  it('shows a neutral notice without data for an agent of another organization', async () => {
    asRole('ADMIN');
    loaded({ agent: null, draftConfig: null, publishedConfig: null, isNotFound: true });
    const html = await render();
    expect(html).toContain(SIMULATOR_NOT_FOUND_NOTICE);
    expect(html).not.toContain('simulator-context-card');
  });
});

describe('AgentSimulatorPage — configurations and offline guarantees', () => {
  afterEach(() => vi.restoreAllMocks());

  it('identifies saved draft and published version, and handles a missing published version', async () => {
    asRole('ADMIN');
    loaded();
    const draftHtml = await render();
    expect(draftHtml).toContain('Configuração: Rascunho salvo');
    expect(draftHtml).toContain('Configurada no rascunho');
    const publishedHtml = await render('active-org', 'publicada');
    expect(publishedHtml).toContain('Configuração: Versão publicada');
    expect(publishedHtml).toContain('Etapa publicada');
    expect(publishedHtml).not.toContain('Etapa do rascunho');
    loaded({ publishedConfig: null });
    const onlyDraft = await render('active-org', 'publicada');
    expect(onlyDraft).toContain('Configuração: Rascunho salvo');
    expect(onlyDraft).not.toContain('simulator-config-published');
    loaded({ draftConfig: null, publishedConfig: null });
    expect(await render()).toContain('ainda não tem rascunho salvo nem versão publicada');
  });

  it('makes no network call, stores nothing and renders no action buttons', async () => {
    asRole('ADMIN');
    loaded();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const html = await render();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(html).toContain(SIMULATOR_OFFLINE_LABEL);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('focus-visible:ring-2');
    expect(html).toContain('grid-cols-1');
  });

  it('simulator modules are server-only, without storage, fetch or client directives', () => {
    const dir = join(__dirname, '../../../../../../features/agents/simulator');
    const sources = [
      ...readdirSync(dir)
        .filter((f) => !f.includes('.test.'))
        .map((f) => readFileSync(join(dir, f), 'utf8')),
      readFileSync(join(__dirname, 'page.tsx'), 'utf8'),
    ];
    for (const source of sources) {
      expect(source).not.toMatch(
        /'use client'|localStorage|sessionStorage|document\.cookie|fetch\(/,
      );
    }
  });
});
