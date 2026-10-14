import * as React from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { Button, Card, CardContent, Skeleton } from '@voice-agent/ui';
import type { KnowledgeDocumentResponse } from '@voice-agent/contracts';
import { KNOWLEDGE_LIMITS } from './knowledge-labels';
import type { KnowledgeFilters } from './knowledge-document-list-types';
import { KnowledgeFilterBar } from './knowledge-filter-bar';
import { KnowledgeDocumentTable } from './knowledge-document-table';
import { KnowledgeDocumentCard } from './knowledge-document-card';
import { KnowledgePagination } from './knowledge-pagination';

export type { KnowledgeFilters } from './knowledge-document-list-types';

interface ListProps {
  readonly documents: readonly KnowledgeDocumentResponse[];
  readonly isLoading: boolean;
  readonly filters: KnowledgeFilters;
  readonly offset: number;
  readonly canIngest: boolean;
  readonly canArchive: boolean;
  readonly onFiltersChange: (next: KnowledgeFilters) => void;
  readonly onPageChange: (nextOffset: number) => void;
  readonly onAdd: () => void;
  readonly onArchive: (doc: KnowledgeDocumentResponse) => void;
}

function EmptyState({
  filtered,
  canIngest,
  onAdd,
  onClear,
}: {
  readonly filtered: boolean;
  readonly canIngest: boolean;
  readonly onAdd: () => void;
  readonly onClear: () => void;
}) {
  return (
    <Card className="border-border/60 shadow-xs" data-testid="kb-empty">
      <CardContent className="flex flex-col items-center py-16 px-4 text-center">
        <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
          <BookOpen className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          {filtered ? 'Nenhum documento encontrado' : 'Nenhum documento cadastrado ainda'}
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mb-6">
          {filtered
            ? 'Nenhum documento corresponde aos filtros atuais.'
            : canIngest
              ? 'Cadastre textos de referência (FAQ, políticas, manuais) para a base de conhecimento da organização.'
              : 'Esta organização ainda não possui documentos na base de conhecimento.'}
        </p>
        {filtered ? (
          <Button size="sm" variant="outline" className="min-h-[44px] text-xs" onClick={onClear}>
            Limpar filtros
          </Button>
        ) : canIngest ? (
          <Button size="sm" className="gap-2 min-h-[44px] text-xs" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            Adicionar conhecimento
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LoadingRows() {
  return (
    <div
      className="space-y-3"
      role="status"
      aria-label="Carregando documentos"
      data-testid="kb-loading"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function KnowledgeDocumentList(props: ListProps) {
  const {
    documents,
    isLoading,
    filters,
    offset,
    canIngest,
    canArchive,
    onFiltersChange,
    onPageChange,
    onAdd,
    onArchive,
  } = props;
  const filtered = filters.status !== '' || filters.collection !== '';
  // A API não retorna total: "próxima" habilita quando a página veio cheia.
  const hasNext = documents.length === KNOWLEDGE_LIMITS.pageSize;

  return (
    <div className="space-y-4">
      <KnowledgeFilterBar filters={filters} onChange={onFiltersChange} />
      {isLoading ? (
        <LoadingRows />
      ) : documents.length === 0 ? (
        <EmptyState
          filtered={filtered}
          canIngest={canIngest}
          onAdd={onAdd}
          onClear={() => onFiltersChange({ status: '', collection: '' })}
        />
      ) : (
        <>
          <KnowledgeDocumentTable
            documents={documents}
            canArchive={canArchive}
            onArchive={onArchive}
          />
          <ul className="md:hidden space-y-3" aria-label="Documentos da base de conhecimento">
            {documents.map((d) => (
              <KnowledgeDocumentCard
                key={d.id}
                doc={d}
                canArchive={canArchive}
                onArchive={onArchive}
              />
            ))}
          </ul>
          <KnowledgePagination offset={offset} hasNext={hasNext} onPageChange={onPageChange} />
        </>
      )}
    </div>
  );
}
