import * as React from 'react';
import { Archive } from 'lucide-react';
import { Button } from '@voice-agent/ui';
import type { KnowledgeDocumentResponse } from '@voice-agent/contracts';
import { KnowledgeStatusBadge } from './knowledge-status-badge';
import { SOURCE_TYPE_LABELS } from './knowledge-labels';
import { formatKnowledgeDate } from './knowledge-date-formatter';

export function KnowledgeDocumentCard({
  doc,
  canArchive,
  onArchive,
}: {
  readonly doc: KnowledgeDocumentResponse;
  readonly canArchive: boolean;
  readonly onArchive: (d: KnowledgeDocumentResponse) => void;
}) {
  return (
    <li
      data-testid={`kb-card-${doc.id}`}
      className="p-4 rounded-lg border border-border/70 bg-card space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm text-foreground break-words min-w-0">{doc.title}</p>
        <KnowledgeStatusBadge status={doc.status} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{SOURCE_TYPE_LABELS[doc.source.sourceType]}</span>
        {doc.collection ? <span className="font-mono">{doc.collection}</span> : null}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs text-muted-foreground">
        <span>{formatKnowledgeDate(doc.updatedAt)}</span>
        {canArchive && doc.status !== 'ARCHIVED' && (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-[44px] gap-2 text-rose-700 dark:text-rose-300"
            onClick={() => onArchive(doc)}
          >
            <Archive className="h-4 w-4" />
            Arquivar
          </Button>
        )}
      </div>
    </li>
  );
}
