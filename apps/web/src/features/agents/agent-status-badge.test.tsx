import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { AgentStatusBadge, AgentPublishedVersionBadge } from './agent-status-badge.js';

describe('AgentStatusBadge (Component)', () => {
  it('renders Ativo badge for ACTIVE status', () => {
    const html = renderToString(React.createElement(AgentStatusBadge, { status: 'ACTIVE' }));
    expect(html).toContain('Ativo');
  });

  it('renders Arquivado badge for ARCHIVED status', () => {
    const html = renderToString(React.createElement(AgentStatusBadge, { status: 'ARCHIVED' }));
    expect(html).toContain('Arquivado');
  });
});

describe('AgentPublishedVersionBadge (Component)', () => {
  it('renders version number when published version exists', () => {
    const html = renderToString(
      React.createElement(AgentPublishedVersionBadge, { versionNumber: 3 }),
    );
    expect(html).toContain('v3');
  });

  it('renders Não publicado when version number is null or undefined', () => {
    const html = renderToString(
      React.createElement(AgentPublishedVersionBadge, { versionNumber: null }),
    );
    expect(html).toContain('Não publicado');
  });
});
