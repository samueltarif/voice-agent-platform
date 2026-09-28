import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { AgentVersionStatusBadge } from './agent-version-status-badge.js';

describe('AgentVersionStatusBadge', () => {
  it('renders Publicado badge for PUBLISHED status', () => {
    const html = renderToString(
      React.createElement(AgentVersionStatusBadge, { status: 'PUBLISHED' }),
    );
    expect(html).toContain('Publicado');
    expect(html).toContain('badge-version-published');
  });

  it('renders Rascunho badge for DRAFT status', () => {
    const html = renderToString(React.createElement(AgentVersionStatusBadge, { status: 'DRAFT' }));
    expect(html).toContain('Rascunho');
    expect(html).toContain('badge-version-draft');
  });

  it('renders Arquivado badge for ARCHIVED status', () => {
    const html = renderToString(
      React.createElement(AgentVersionStatusBadge, { status: 'ARCHIVED' }),
    );
    expect(html).toContain('Arquivado');
    expect(html).toContain('badge-version-archived');
  });
});
