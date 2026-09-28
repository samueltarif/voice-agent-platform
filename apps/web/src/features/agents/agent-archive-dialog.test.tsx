import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { AgentArchiveDialog } from './agent-archive-dialog.js';

vi.mock('@voice-agent/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@voice-agent/ui')>();
  return {
    ...actual,
    DialogContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', props, children),
    DialogTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) =>
      React.createElement('h2', props, children),
    DialogDescription: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) =>
      React.createElement('p', props, children),
  };
});

describe('AgentArchiveDialog', () => {
  it('renders archive mode text and action button', () => {
    const html = renderToString(
      React.createElement(AgentArchiveDialog, {
        isOpen: true,
        onOpenChange: () => {},
        mode: 'archive',
        agentName: 'Support Bot',
        isPending: false,
        onConfirm: () => {},
      }),
    );

    expect(html).toContain('archive-confirm-dialog');
    expect(html).toContain('Ao arquivar o agente');
    expect(html).toContain('Support Bot');
    expect(html).toContain('btn-confirm-archive');
    expect(html).toContain('Arquivar agente');
  });

  it('renders reactivate mode text and action button', () => {
    const html = renderToString(
      React.createElement(AgentArchiveDialog, {
        isOpen: true,
        onOpenChange: () => {},
        mode: 'reactivate',
        agentName: 'Support Bot',
        isPending: false,
        onConfirm: () => {},
      }),
    );

    expect(html).toContain('Ao reativar o agente');
    expect(html).toContain('btn-confirm-reactivate');
    expect(html).toContain('Reativar agente');
  });

  it('renders pending state when isPending is true', () => {
    const html = renderToString(
      React.createElement(AgentArchiveDialog, {
        isOpen: true,
        onOpenChange: () => {},
        mode: 'archive',
        agentName: 'Support Bot',
        isPending: true,
        onConfirm: () => {},
      }),
    );

    expect(html).toContain('Arquivando...');
    expect(html).toContain('disabled=""');
  });
});
