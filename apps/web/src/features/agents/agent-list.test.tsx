import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { AgentList } from './agent-list.js';
import type { AgentMetadataResponse } from '@voice-agent/contracts';

const MOCK_AGENTS: AgentMetadataResponse[] = [
  {
    id: 'agent-1',
    name: 'Assistente Comercial',
    slug: 'assistente-comercial',
    status: 'ACTIVE',
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-21T12:00:00.000Z',
    currentPublishedVersionNumber: 2,
  },
  {
    id: 'agent-2',
    name: 'Suporte Técnico',
    slug: 'suporte-tecnico',
    status: 'ARCHIVED',
    createdAt: '2026-09-15T08:00:00.000Z',
    updatedAt: '2026-09-18T09:30:00.000Z',
    currentPublishedVersionNumber: null,
  },
];

describe('AgentList (Component)', () => {
  it('renders empty state with CTA when agents list is empty and user can create', () => {
    const html = renderToString(
      React.createElement(AgentList, {
        agents: [],
        canCreate: true,
        orgSlug: 'acme-corp',
      }),
    );
    expect(html).toContain('Nenhum agente criado ainda');
    expect(html).toContain('Criar agente');
    expect(html).toContain('/orgs/acme-corp/agents/new');
  });

  it('renders empty state without creation CTA when user cannot create', () => {
    const html = renderToString(
      React.createElement(AgentList, {
        agents: [],
        canCreate: false,
        orgSlug: 'acme-corp',
      }),
    );
    expect(html).toContain('Nenhum agente criado ainda');
    expect(html).not.toContain('Criar agente');
  });

  it('renders table rows and mobile cards when agents are present', () => {
    const html = renderToString(
      React.createElement(AgentList, {
        agents: MOCK_AGENTS,
        canCreate: true,
        orgSlug: 'acme-corp',
      }),
    );
    expect(html).toContain('Assistente Comercial');
    expect(html).toContain('assistente-comercial');
    expect(html).toContain('Suporte Técnico');
    expect(html).toContain('suporte-tecnico');
    expect(html).toContain('Ativo');
    expect(html).toContain('Arquivado');
    expect(html).toContain('v2');
    expect(html).toContain('Não publicado');
  });
});
