import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { AgentPublishDialog } from './agent-publish-dialog.js';

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

describe('AgentPublishDialog', () => {
  it('renders confirmation text with version number when open', () => {
    const html = renderToString(
      React.createElement(AgentPublishDialog, {
        isOpen: true,
        onOpenChange: () => {},
        versionNumber: 3,
        isPublishing: false,
        onConfirmPublish: () => {},
      }),
    );

    expect(html).toContain('publish-confirm-dialog');
    expect(html).toContain('Esta versão passará a ser a versão publicada');
    expect(html).toContain('v3');
    expect(html).toContain('Publicar versão');
  });

  it('renders disabled loading state when isPublishing is true', () => {
    const html = renderToString(
      React.createElement(AgentPublishDialog, {
        isOpen: true,
        onOpenChange: () => {},
        versionNumber: 1,
        isPublishing: true,
        onConfirmPublish: () => {},
      }),
    );

    expect(html).toContain('Publicando...');
    expect(html).toContain('disabled=""');
  });
});
