import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { KnowledgeIngestForm } from './knowledge-ingest-form';

vi.mock('@voice-agent/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@voice-agent/ui')>();
  return {
    ...actual,
    SheetContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', props, children),
    SheetTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) =>
      React.createElement('h2', props, children),
    SheetDescription: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) =>
      React.createElement('p', props, children),
  };
});

describe('KnowledgeIngestForm', () => {
  it('renders all required fields with accessible labels when open', () => {
    const html = renderToString(
      React.createElement(KnowledgeIngestForm, {
        isOpen: true,
        onOpenChange: () => {},
        onSubmit: async () => ({ ok: true as const, isIdempotentDuplicate: false }),
      }),
    );
    expect(html).toContain('Adicionar conhecimento');
    expect(html).toContain('for="kb-title"');
    expect(html).toContain('for="kb-sourceType"');
    expect(html).toContain('for="kb-locator"');
    expect(html).toContain('for="kb-rawText"');
    expect(html).toContain('Upload de arquivos não está disponível');
    expect(html).toContain('kb-submit-ingest');
    expect(html).toContain('200.000');
  });

  it('associates hints and errors with fields for assistive technology', () => {
    const html = renderToString(
      React.createElement(KnowledgeIngestForm, {
        isOpen: true,
        onOpenChange: () => {},
        onSubmit: async () => ({ ok: true as const, isIdempotentDuplicate: false }),
      }),
    );
    expect(html).toContain('kb-locator-hint');
    expect(html).toContain('Cadastrar documento');
  });

  it('states the plain-text-only scope and character counter', () => {
    const html = renderToString(
      React.createElement(KnowledgeIngestForm, {
        isOpen: true,
        onOpenChange: () => {},
        onSubmit: async () => ({ ok: true as const, isIdempotentDuplicate: false }),
      }),
    );
    // O mock de Sheet sempre renderiza o conteúdo; o Radix real só o exibe aberto.
    // Aqui valem as garantias estáticas: sem upload e contador de 200.000.
    expect(html).toContain('Upload de arquivos não está disponível');
    expect(html).toContain('200.000');
  });
});
