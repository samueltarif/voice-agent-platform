import * as React from 'react';
import { renderToString } from 'react-dom/server';
import type { KnowledgeDocumentResponse } from '@voice-agent/contracts';
import { KnowledgeDocumentList, type KnowledgeFilters } from './knowledge-document-list';

export const KNOWLEDGE_TEST_DOC: KnowledgeDocumentResponse = {
  id: '22222222-2222-2222-2222-222222222222',
  organizationId: '11111111-1111-1111-1111-111111111111',
  title: 'Política de trocas e devoluções',
  source: { sourceType: 'POLICY', locator: 'docs/trocas.md' },
  status: 'READY',
  collection: 'suporte',
  createdAt: '2026-10-13T14:02:00.000Z',
  updatedAt: '2026-10-13T14:02:00.000Z',
};

export const KNOWLEDGE_TEST_FILTERS: KnowledgeFilters = { status: '', collection: '' };

export interface RenderKnowledgeListOptions {
  readonly documents?: readonly KnowledgeDocumentResponse[];
  readonly filters?: KnowledgeFilters;
  readonly isLoading?: boolean;
  readonly canArchive?: boolean;
  readonly offset?: number;
}

interface ResolvedListOptions {
  readonly documents: readonly KnowledgeDocumentResponse[];
  readonly filters: KnowledgeFilters;
  readonly isLoading: boolean;
  readonly canArchive: boolean;
  readonly offset: number;
}

const DEFAULT_RENDER_OPTIONS: ResolvedListOptions = {
  documents: [KNOWLEDGE_TEST_DOC],
  filters: KNOWLEDGE_TEST_FILTERS,
  isLoading: false,
  canArchive: true,
  offset: 0,
};

function resolveRenderOptions(
  docsOrOptions?: readonly KnowledgeDocumentResponse[] | RenderKnowledgeListOptions,
  filtersArg?: KnowledgeFilters,
  optionsArg?: { isLoading?: boolean; canArchive?: boolean },
): ResolvedListOptions {
  if (Array.isArray(docsOrOptions)) {
    const customFilters = filtersArg ? { filters: filtersArg } : {};
    return Object.assign({}, DEFAULT_RENDER_OPTIONS, optionsArg, customFilters, {
      documents: docsOrOptions,
    });
  }
  return Object.assign({}, DEFAULT_RENDER_OPTIONS, docsOrOptions);
}

export function renderKnowledgeList(options?: RenderKnowledgeListOptions): string;
export function renderKnowledgeList(
  documents?: readonly KnowledgeDocumentResponse[],
  filters?: KnowledgeFilters,
  options?: { isLoading?: boolean; canArchive?: boolean },
): string;
export function renderKnowledgeList(
  docsOrOptions?: readonly KnowledgeDocumentResponse[] | RenderKnowledgeListOptions,
  filtersArg?: KnowledgeFilters,
  optionsArg?: { isLoading?: boolean; canArchive?: boolean },
): string {
  const { documents, filters, isLoading, canArchive, offset } = resolveRenderOptions(
    docsOrOptions,
    filtersArg,
    optionsArg,
  );
  return renderToString(
    React.createElement(KnowledgeDocumentList, {
      documents,
      isLoading,
      filters,
      offset,
      canIngest: true,
      canArchive,
      onFiltersChange: () => {},
      onPageChange: () => {},
      onAdd: () => {},
      onArchive: () => {},
    }),
  );
}
