import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { KnowledgeArchiveDialog } from './knowledge-archive-dialog';

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

const baseProps = {
  isOpen: true,
  documentTitle: 'FAQ — planos e preços',
  isPending: false,
  onOpenChange: () => {},
  onConfirm: () => {},
};

describe('KnowledgeArchiveDialog', () => {
  it('requires explicit confirmation with the document title', () => {
    const html = renderToString(React.createElement(KnowledgeArchiveDialog, baseProps));
    expect(html).toContain('Arquivar documento');
    expect(html).toContain('FAQ — planos e preços');
    expect(html).toContain('kb-confirm-archive');
    expect(html).toContain('Confirmar arquivamento');
    expect(html).toContain('Cancelar');
    expect(html).toContain('não pode ser reativado');
  });

  it('disables both actions while the archive request is pending', () => {
    const html = renderToString(
      React.createElement(KnowledgeArchiveDialog, { ...baseProps, isPending: true }),
    );
    expect(html).toContain('Arquivando...');
    expect(html).toContain('disabled=""');
  });

  it('keeps failure feedback visible without closing the dialog', () => {
    const html = renderToString(
      React.createElement(KnowledgeArchiveDialog, { ...baseProps, errorStatus: 500 }),
    );
    expect(html).toContain('kb-archive-dialog');
    expect(html).toContain('Algo deu errado');
    expect(html).toContain('Confirmar arquivamento');
  });
});
