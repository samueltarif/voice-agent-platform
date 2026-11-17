import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeExtractionResponse } from '@voice-agent/contracts';
import { KnowledgeUploadPreview } from './knowledge-upload-preview';
import { KnowledgeUploadDialog } from './knowledge-upload-dialog';
import {
  describeUploadConfirmFailure,
  UPLOAD_CONFLICT_MESSAGE,
  type KnowledgeUploadState,
} from './use-knowledge-upload';

vi.mock('@voice-agent/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@voice-agent/ui')>();
  const tag =
    (name: string) =>
    ({ children, ...props }: React.HTMLAttributes<HTMLElement>) =>
      React.createElement(name, props, children);
  return { ...actual, SheetContent: tag('div'), SheetTitle: tag('h2'), SheetDescription: tag('p') };
});

const PREVIEW: KnowledgeExtractionResponse = {
  format: 'DOCX',
  fileName: 'catalogo.docx',
  suggestedTitle: 'catalogo',
  suggestedLocator: 'arquivo:catalogo.docx',
  text: '<script>alert(1)</script>\n# Título **negrito** [link](javascript:x)',
  stats: { bytes: 10, chars: 60, lines: 2 },
  warnings: ['DOCX_MAIN_BODY_ONLY'],
};

function stateWith(partial: Partial<KnowledgeUploadState>): KnowledgeUploadState {
  const noop = () => {};
  return {
    phase: 'preview',
    file: null,
    preview: PREVIEW,
    title: 'catalogo',
    sourceType: 'MANUAL_UPLOAD',
    error: null,
    duplicate: false,
    selectFile: noop,
    setTitle: noop,
    setSourceType: noop,
    read: async () => {},
    confirm: async () => {},
    reset: noop,
    ...partial,
  };
}

describe('Knowledge upload UI (DEC-065)', () => {
  it('renders the extracted text as plain text, never as HTML or Markdown', () => {
    const html = renderToString(<KnowledgeUploadPreview upload={stateWith({})} />);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('**negrito** [link](javascript:x)');
    expect(html).not.toContain('<strong>');
    expect(html).not.toContain('href=');
    expect(html).toContain('Só o corpo principal do documento foi lido');
    expect(html).toContain('Nada foi salvo ainda');
  });

  it('offers only the accepted extensions and states the limits in the picker', () => {
    const html = renderToString(
      <KnowledgeUploadDialog
        orgSlug="org-a"
        isOpen
        onOpenChange={() => {}}
        onConfirm={async () => ({ ok: true, isIdempotentDuplicate: false })}
      />,
    );
    expect(html).toContain('accept=".txt,.md,.markdown,.docx"');
    expect(html).toContain('PDF ainda não é aceito');
    expect(html).toContain('Nada é salvo até você confirmar');
  });

  it('guides a same-name conflict to “Editar conteúdo” and keeps other failures generic', () => {
    expect(describeUploadConfirmFailure({ ok: false, status: 409, code: 'CONFLICT' })).toBe(
      UPLOAD_CONFLICT_MESSAGE,
    );
    expect(UPLOAD_CONFLICT_MESSAGE).toContain('Editar conteúdo');
    expect(describeUploadConfirmFailure({ ok: false, status: 403 })).toContain('não permite');
  });
});
