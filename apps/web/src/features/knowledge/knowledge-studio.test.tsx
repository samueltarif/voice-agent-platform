import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { KnowledgeStudio } from './knowledge-studio';

vi.mock('../../lib/knowledge/knowledge-documents-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/knowledge/knowledge-documents-client')>();
  return { ...actual };
});

describe('KnowledgeStudio (permissions + safe states)', () => {
  it('renders restricted state for OPERATOR (server-side role gate happens before any fetch)', () => {
    const html = renderToString(React.createElement(KnowledgeStudio, { role: 'OPERATOR' }));
    expect(html).toContain('Acesso restrito');
    expect(html).toContain('kb-error-no-permission');
    expect(html).not.toContain('Adicionar conhecimento');
  });

  it('renders restricted state for VIEWER', () => {
    const html = renderToString(React.createElement(KnowledgeStudio, { role: 'VIEWER' }));
    expect(html).toContain('Acesso restrito');
  });

  it('shows the ingest entry point for OWNER during initial load', () => {
    const html = renderToString(React.createElement(KnowledgeStudio, { role: 'OWNER' }));
    expect(html).toContain('Base de Conhecimento');
    expect(html).toContain('Adicionar conhecimento');
    expect(html).toContain('kb-loading');
  });

  it('shows the ingest entry point for MANAGER', () => {
    const html = renderToString(React.createElement(KnowledgeStudio, { role: 'MANAGER' }));
    expect(html).toContain('Adicionar conhecimento');
  });

  it('announces async feedback through a polite live region', () => {
    const html = renderToString(React.createElement(KnowledgeStudio, { role: 'ADMIN' }));
    expect(html).toContain('aria-live="polite"');
  });
});
