import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@voice-agent/ui';
import { KNOWLEDGE_LIMITS } from './knowledge-labels';

export function KnowledgePagination({
  offset,
  hasNext,
  disabled = false,
  onPageChange,
}: {
  readonly offset: number;
  readonly hasNext: boolean;
  readonly disabled?: boolean;
  readonly onPageChange: (nextOffset: number) => void;
}) {
  const page = Math.floor(offset / KNOWLEDGE_LIMITS.pageSize) + 1;
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">Página {page}</span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] gap-1 text-xs"
          disabled={disabled || offset === 0}
          onClick={() => onPageChange(Math.max(0, offset - KNOWLEDGE_LIMITS.pageSize))}
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] gap-1 text-xs"
          disabled={disabled || !hasNext}
          onClick={() => onPageChange(offset + KNOWLEDGE_LIMITS.pageSize)}
        >
          Próxima
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
