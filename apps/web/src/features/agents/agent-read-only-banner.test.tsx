import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { AgentReadOnlyBanner } from './agent-read-only-banner.js';

describe('AgentReadOnlyBanner', () => {
  it('renders published version notice', () => {
    const html = renderToString(
      React.createElement(AgentReadOnlyBanner, { versionNumber: 1, status: 'PUBLISHED' }),
    );
    expect(html).toContain('version-read-only-banner');
    expect(html).toContain('Versão v1 (Publicada) — Somente Leitura');
  });

  it('renders archived version notice', () => {
    const html = renderToString(
      React.createElement(AgentReadOnlyBanner, { versionNumber: 1, status: 'ARCHIVED' }),
    );
    expect(html).toContain('version-read-only-banner');
    expect(html).toContain('Versão v1 (Arquivada) — Somente Leitura');
  });

  it('renders agent archived notice when isAgentArchived is true', () => {
    const html = renderToString(
      React.createElement(AgentReadOnlyBanner, {
        versionNumber: 2,
        status: 'DRAFT',
        isAgentArchived: true,
      }),
    );
    expect(html).toContain('agent-archived-banner');
    expect(html).toContain('Agente Arquivado');
  });
});
