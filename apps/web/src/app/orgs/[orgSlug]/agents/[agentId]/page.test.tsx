import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from 'next/navigation';
import { getServerOrganizationContext } from '../../../../../lib/organization/server-organization-context.js';
import { loadAgentDetailData } from './load-agent-detail-data.js';
import AgentDetailPage from './page.js';
import type { AgentMetadataResponse, AgentVersionMetadataResponse } from '@voice-agent/contracts';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from '../../../../../features/agents/agent-default-configuration.js';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  usePathname: () => '/orgs/active-org/agents/agent-1',
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

vi.mock('./load-agent-detail-data.js', () => ({
  loadAgentDetailData: vi.fn(),
}));

const MOCK_AGENT: AgentMetadataResponse = {
  id: 'agent-1',
  name: 'Agente de Vendas',
  slug: 'agente-de-vendas',
  status: 'ACTIVE',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-21T12:00:00.000Z',
  currentPublishedVersionNumber: 1,
};

const MOCK_DRAFT_VERSION: AgentVersionMetadataResponse = {
  id: 'ver-draft-1',
  versionNumber: 2,
  status: 'DRAFT',
  configurationSchemaVersion: 1,
  createdAt: '2026-09-22T10:00:00.000Z',
  updatedAt: '2026-09-22T10:00:00.000Z',
  publishedAt: null,
  publishedBy: null,
};

describe('AgentDetailPage - Routing & Access Guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /login when unauthenticated', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'UNAUTHENTICATED',
      availableOrganizations: [],
    });

    await AgentDetailPage({
      params: Promise.resolve({ orgSlug: 'active-org', agentId: 'agent-1' }),
    });
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('redirects to canonical active org when URL slug does not match active org', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'active-org',
        name: 'Active Org',
        role: 'ADMIN',
      },
      availableOrganizations: [],
      user: { id: 'usr-1', email: 'admin@example.com' },
    });

    await AgentDetailPage({
      params: Promise.resolve({ orgSlug: 'wrong-org', agentId: 'agent-1' }),
    });
    expect(redirect).toHaveBeenCalledWith('/orgs/active-org/agents/agent-1');
  });

  it('renders 404 state when agent is not found or belongs to another tenant', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'active-org',
        name: 'Active Org',
        role: 'ADMIN',
      },
      availableOrganizations: [],
      user: { id: 'usr-1', email: 'admin@example.com' },
    });

    vi.mocked(loadAgentDetailData).mockResolvedValueOnce({
      agent: null,
      versions: [],
      draftVersion: null,
      draftConfig: null,
      publishedConfig: null,
      isNotFound: true,
      errorMessage: null,
    });

    const element = await AgentDetailPage({
      params: Promise.resolve({ orgSlug: 'active-org', agentId: 'agent-1' }),
    });
    const html = renderToString(element!);

    expect(html).toContain('Agente não encontrado');
    expect(html).toContain('O agente solicitado não existe ou pertence a outra organização.');
  });
});

describe('AgentDetailPage - Role Access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders restricted access card for VIEWER role even when draft exists', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'active-org',
        name: 'Active Org',
        role: 'VIEWER',
      },
      availableOrganizations: [],
      user: { id: 'usr-viewer', email: 'viewer@example.com' },
    });

    vi.mocked(loadAgentDetailData).mockResolvedValueOnce({
      agent: MOCK_AGENT,
      versions: [MOCK_DRAFT_VERSION],
      draftVersion: MOCK_DRAFT_VERSION,
      draftConfig: null,
      publishedConfig: null,
      isNotFound: false,
      errorMessage: null,
    });

    const element = await AgentDetailPage({
      params: Promise.resolve({ orgSlug: 'active-org', agentId: 'agent-1' }),
    });
    const html = renderToString(element!);

    expect(html).toContain('Agente de Vendas');
    expect(html).toContain('Visualização Restrita');
    expect(html).not.toContain('Editor de Rascunho');
  });
});

describe('AgentDetailPage - Draft Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Criar rascunho" CTA when draft does not exist for ADMIN', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'active-org',
        name: 'Active Org',
        role: 'ADMIN',
      },
      availableOrganizations: [],
      user: { id: 'usr-admin', email: 'admin@example.com' },
    });

    vi.mocked(loadAgentDetailData).mockResolvedValueOnce({
      agent: MOCK_AGENT,
      versions: [],
      draftVersion: null,
      draftConfig: null,
      publishedConfig: null,
      isNotFound: false,
      errorMessage: null,
    });

    const element = await AgentDetailPage({
      params: Promise.resolve({ orgSlug: 'active-org', agentId: 'agent-1' }),
    });
    const html = renderToString(element!);

    expect(html).toContain('Agente de Vendas');
    expect(html).toContain('Nenhum rascunho em edição');
    expect(html).toContain('Criar rascunho');
  });

  it('renders draft editor with configuration when draft exists for OWNER', async () => {
    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'active-org',
        name: 'Active Org',
        role: 'OWNER',
      },
      availableOrganizations: [],
      user: { id: 'usr-owner', email: 'owner@example.com' },
    });

    vi.mocked(loadAgentDetailData).mockResolvedValueOnce({
      agent: MOCK_AGENT,
      versions: [MOCK_DRAFT_VERSION],
      draftVersion: MOCK_DRAFT_VERSION,
      draftConfig: DEFAULT_AGENT_CONFIGURATION_V1,
      publishedConfig: null,
      isNotFound: false,
      errorMessage: null,
    });

    const element = await AgentDetailPage({
      params: Promise.resolve({ orgSlug: 'active-org', agentId: 'agent-1' }),
    });
    const html = renderToString(element!);

    expect(html).toContain('Agente de Vendas');
    expect(html).toContain('Editor de Rascunho');
    expect(html).toContain('Persona e Identidade Vocal');
    expect(html).toContain('Regras de Comportamento');
    expect(html).toContain('Salvar rascunho');
    expect(html).toContain('Publicar rascunho');
    expect(html).toContain('Arquivar');
  });
});

describe('AgentDetailPage - Published Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders published version in read-only mode when no draft exists and published version is present', async () => {
    const publishedVersion: AgentVersionMetadataResponse = {
      id: 'ver-pub-1',
      versionNumber: 1,
      status: 'PUBLISHED',
      configurationSchemaVersion: 1,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      publishedAt: '2026-09-01T10:05:00.000Z',
      publishedBy: 'usr-admin',
    };

    vi.mocked(getServerOrganizationContext).mockResolvedValueOnce({
      status: 'RESOLVED',
      context: {
        organizationId: 'org-1',
        slug: 'active-org',
        name: 'Active Org',
        role: 'ADMIN',
      },
      availableOrganizations: [],
      user: { id: 'usr-admin', email: 'admin@example.com' },
    });

    vi.mocked(loadAgentDetailData).mockResolvedValueOnce({
      agent: { ...MOCK_AGENT, currentPublishedVersionNumber: 1 },
      versions: [publishedVersion],
      draftVersion: null,
      draftConfig: null,
      publishedConfig: DEFAULT_AGENT_CONFIGURATION_V1,
      isNotFound: false,
      errorMessage: null,
    });

    const element = await AgentDetailPage({
      params: Promise.resolve({ orgSlug: 'active-org', agentId: 'agent-1' }),
    });
    const html = renderToString(element!);

    expect(html).toContain('Versão v1 (Publicada) — Somente Leitura');
    expect(html).toContain('Persona e Identidade Vocal');
    expect(html).not.toContain('Salvar rascunho');
  });
});
