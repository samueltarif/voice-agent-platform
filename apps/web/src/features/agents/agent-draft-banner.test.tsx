import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { AgentDraftBanner } from './agent-draft-banner.js';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe('AgentDraftBanner', () => {
  it('renders restricted view when canReadConfig is false', () => {
    const html = renderToString(
      React.createElement(AgentDraftBanner, {
        agentId: 'agent-1',
        hasDraft: true,
        canReadConfig: false,
        canEdit: false,
      }),
    );

    expect(html).toContain('Visualização Restrita');
    expect(html).toContain('Apenas administradores e gerentes possuem permissão');
    expect(html).not.toContain('Criar rascunho');
  });

  it('renders create draft CTA when hasDraft is false and canEdit is true', () => {
    const html = renderToString(
      React.createElement(AgentDraftBanner, {
        agentId: 'agent-1',
        hasDraft: false,
        canReadConfig: true,
        canEdit: true,
      }),
    );

    expect(html).toContain('Nenhum rascunho em edição');
    expect(html).toContain('Criar rascunho');
  });

  it('renders no draft message without CTA when canEdit is false', () => {
    const html = renderToString(
      React.createElement(AgentDraftBanner, {
        agentId: 'agent-1',
        hasDraft: false,
        canReadConfig: true,
        canEdit: false,
      }),
    );

    expect(html).toContain('Nenhum rascunho em edição');
    expect(html).not.toContain('Criar rascunho');
  });

  it('renders nothing when hasDraft is true and canReadConfig is true', () => {
    const html = renderToString(
      React.createElement(AgentDraftBanner, {
        agentId: 'agent-1',
        hasDraft: true,
        canReadConfig: true,
        canEdit: true,
      }),
    );

    expect(html).toBe('');
  });
});
