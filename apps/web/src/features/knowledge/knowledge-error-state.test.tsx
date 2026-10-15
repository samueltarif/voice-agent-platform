import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { KnowledgeErrorState } from './knowledge-error-state';

describe('KnowledgeErrorState (fixed safe copy, never server text)', () => {
  it.each([
    ['connection', 'Sem conexão'],
    ['validation', 'Dados inválidos'],
    ['unauthenticated', 'Sessão expirada'],
    ['forbidden', 'Permissão insuficiente'],
    ['not-found', 'Documento não encontrado'],
    ['conflict', 'Documento em conflito'],
    ['internal', 'Algo deu errado'],
    ['no-permission', 'Acesso restrito'],
  ] as const)('renders %s with fixed Portuguese copy', (kind, title) => {
    const html = renderToString(React.createElement(KnowledgeErrorState, { kind }));
    expect(html).toContain(title);
    expect(html).toContain(`kb-error-${kind}`);
  });

  it('never echoes technical server strings', () => {
    const html = renderToString(React.createElement(KnowledgeErrorState, { kind: 'internal' }));
    expect(html).not.toMatch(/SELECT|INSERT|constraint|params|stack|assertion/i);
  });

  it('offers retry for recoverable kinds only', () => {
    const retryHtml = renderToString(
      React.createElement(KnowledgeErrorState, { kind: 'connection', onRetry: () => {} }),
    );
    expect(retryHtml).toContain('Tentar novamente');
    const conflictHtml = renderToString(
      React.createElement(KnowledgeErrorState, { kind: 'conflict' }),
    );
    expect(conflictHtml).not.toContain('Tentar novamente');
  });
});

describe('KnowledgeErrorState org-changed', () => {
  it('asks the user to reload when the active organization changed in another tab', () => {
    const html = renderToString(React.createElement(KnowledgeErrorState, { kind: 'org-changed' }));
    expect(html).toContain('kb-error-org-changed');
    expect(html).toContain('Organização alterada');
    expect(html).toContain('Recarregar página');
  });
});
