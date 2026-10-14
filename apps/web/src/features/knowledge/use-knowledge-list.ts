import * as React from 'react';
import {
  fetchKnowledgeDocuments,
  type KnowledgeBffError,
} from '../../lib/knowledge/knowledge-documents-client';
import { KNOWLEDGE_LIMITS } from './knowledge-labels';
import type { KnowledgeFilters } from './knowledge-document-list-types';
import type { KnowledgeDocumentResponse } from '@voice-agent/contracts';
import { kindFromStatus, type KnowledgeErrorKind } from './knowledge-error-state';
import { createKnowledgeRequestSequence } from './knowledge-request-sequence';

export interface KnowledgeListRequest {
  readonly offset: number;
  readonly filters: KnowledgeFilters;
  readonly signal?: AbortSignal | undefined;
}

function statusOf(e: unknown): number {
  const status = (e as KnowledgeBffError)?.status;
  return typeof status === 'number' ? status : 0;
}

type PageResultOkTrue = {
  readonly settled: true;
  readonly ok: true;
  readonly documents: KnowledgeDocumentResponse[];
  readonly status: number;
};
type PageResultOkFalse = { readonly settled: true; readonly ok: false; readonly status: number };
type PageResult = { readonly settled: false } | PageResultOkTrue | PageResultOkFalse;

function buildListQuery(offset: number, filters: KnowledgeFilters) {
  return {
    limit: KNOWLEDGE_LIMITS.pageSize,
    offset,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.collection ? { collection: filters.collection } : {}),
  };
}

interface FetchPageOptions {
  readonly signal?: AbortSignal | undefined;
  readonly ticket: number;
  readonly isCurrent: (ticket: number) => boolean;
}

function isTicketStale(options?: FetchPageOptions): boolean {
  return Boolean(options && !options.isCurrent(options.ticket));
}

async function fetchKnowledgePage(
  offset: number,
  filters: KnowledgeFilters,
  options?: FetchPageOptions,
): Promise<PageResult> {
  if (isTicketStale(options)) return { settled: false };
  try {
    const query = buildListQuery(offset, filters);
    const r = await fetchKnowledgeDocuments(
      query,
      options?.signal ? { signal: options.signal } : undefined,
    );
    if (isTicketStale(options)) return { settled: false };
    return { settled: true, ok: true, documents: r.documents, status: 200 };
  } catch (error) {
    if (isTicketStale(options)) return { settled: false };
    return { settled: true, ok: false, status: statusOf(error) };
  }
}

interface PageResultHandlers {
  readonly setIsLoading: (loading: boolean) => void;
  readonly setLoadError: (error: KnowledgeErrorKind | null) => void;
  readonly setDocuments: (docs: KnowledgeDocumentResponse[]) => void;
}

function applyPageResult(result: PageResult, handlers: PageResultHandlers): void {
  if (!result.settled) return;
  handlers.setIsLoading(false);
  handlers.setLoadError(result.ok ? null : kindFromStatus(result.status));
  if (result.ok) handlers.setDocuments(result.documents);
}

interface AutoFetchOptions {
  readonly canRead: boolean;
  readonly offset: number;
  readonly filters: KnowledgeFilters;
  readonly handleFetchPage: (request?: KnowledgeListRequest) => Promise<void>;
}

function useListAutoFetch(options: AutoFetchOptions): void {
  const { canRead, offset, filters, handleFetchPage } = options;
  React.useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    void handleFetchPage({ offset, filters, signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [canRead, offset, filters, handleFetchPage]);
}

export interface KnowledgeListQuery {
  readonly documents: KnowledgeDocumentResponse[];
  readonly isLoading: boolean;
  readonly loadError: KnowledgeErrorKind | null;
  readonly filters: KnowledgeFilters;
  readonly offset: number;
  readonly setFilters: (filters: KnowledgeFilters) => void;
  readonly setOffset: (offset: number) => void;
  readonly reload: (request?: KnowledgeListRequest) => Promise<void>;
  readonly currentQuery: () => KnowledgeListRequest;
}

function useKnowledgeListQueryInner(
  canRead: boolean,
  createSequence: () => ReturnType<typeof createKnowledgeRequestSequence>,
) {
  const sequenceRef = React.useRef<ReturnType<typeof createKnowledgeRequestSequence> | null>(null);
  if (!sequenceRef.current) {
    sequenceRef.current = createSequence();
  }
  const sequence = sequenceRef.current;
  const [documents, setDocuments] = React.useState<KnowledgeDocumentResponse[]>([]);
  const [isLoading, setIsLoading] = React.useState(canRead);
  const [loadError, setLoadError] = React.useState<KnowledgeErrorKind | null>(null);
  const [filters, setFiltersState] = React.useState<KnowledgeFilters>({
    status: '',
    collection: '',
  });
  const [offset, setOffsetState] = React.useState(0);

  const handleFetchPage = React.useCallback(
    async function handleFetchPageInner(request?: KnowledgeListRequest): Promise<void> {
      setIsLoading(true);
      const ticket = sequence.next();
      const targetOffset = request?.offset ?? offset;
      const targetFilters = request?.filters ?? filters;
      const result = await fetchKnowledgePage(targetOffset, targetFilters, {
        signal: request?.signal,
        ticket,
        isCurrent: (t: number) => sequence.isCurrent(t),
      });
      if (sequence.isCurrent(ticket)) {
        applyPageResult(result, { setIsLoading, setLoadError, setDocuments });
      }
    },
    [sequence, offset, filters],
  );

  useListAutoFetch({ canRead, offset, filters, handleFetchPage });

  return {
    documents,
    isLoading,
    loadError,
    filters,
    offset,
    setFilters: setFiltersState,
    setOffset: setOffsetState,
    reload: handleFetchPage,
    currentQuery: React.useCallback(
      () => ({ offset, filters: { status: filters.status, collection: filters.collection } }),
      [offset, filters.status, filters.collection],
    ),
  } as const;
}

export function useKnowledgeListQuery(canRead: boolean) {
  return useKnowledgeListQueryInner(canRead, createKnowledgeRequestSequence);
}
