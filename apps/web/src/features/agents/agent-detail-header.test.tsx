import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { AgentDetailHeader } from './agent-detail-header.js';
import type { AgentMetadataResponse, AgentVersionMetadataResponse } from '@voice-agent/contracts';

const MOCK_AGENT: AgentMetadataResponse = {
  id: 'agent-123',
  name: 'Agente de Cobrança',
  slug: 'agente-de-cobranca',
  status: 'ACTIVE',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-21T12:00:00.000Z',
  currentPublishedVersionNumber: 3,
};

const MOCK_DRAFT: AgentVersionMetadataResponse = {
  id: 'ver-draft-4',
  versionNumber: 4,
  status: 'DRAFT',
  configurationSchemaVersion: 1,
  createdAt: '2026-09-22T10:00:00.000Z',
  updatedAt: '2026-09-22T10:00:00.000Z',
  publishedAt: null,
  publishedBy: null,
};

describe('AgentDetailHeader', () => {
  it('renders agent name, slug, status, and published/draft badges', () => {
    const html = renderToString(
      React.createElement(AgentDetailHeader, {
        agent: MOCK_AGENT,
        currentDraft: MOCK_DRAFT,
        orgSlug: 'test-org',
      }),
    );

    expect(html).toContain('Agente de Cobrança');
    expect(html).toContain('agente-de-cobranca');
    expect(html).toContain('Ativo');
    expect(html).toContain('v3');
    expect(html).toContain('Rascunho v4');
    expect(html).toContain('/orgs/test-org/agents');
  });

  it('renders without draft badge when currentDraft is null', () => {
    const html = renderToString(
      React.createElement(AgentDetailHeader, {
        agent: { ...MOCK_AGENT, currentPublishedVersionNumber: null },
        currentDraft: null,
        orgSlug: 'test-org',
      }),
    );

    expect(html).toContain('Não publicado');
    expect(html).not.toContain('Rascunho v');
  });
});
