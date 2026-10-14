import * as React from 'react';
import { Archive, MoreHorizontal } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@voice-agent/ui';
import type { KnowledgeDocumentResponse } from '@voice-agent/contracts';
import { KnowledgeStatusBadge } from './knowledge-status-badge';
import { SOURCE_TYPE_LABELS } from './knowledge-labels';
import { formatKnowledgeDate } from './knowledge-date-formatter';

function RowActions({
  doc,
  canArchive,
  onArchive,
}: {
  readonly doc: KnowledgeDocumentResponse;
  readonly canArchive: boolean;
  readonly onArchive: (d: KnowledgeDocumentResponse) => void;
}) {
  // Sem ações disponíveis → nenhum menu (evita menu vazio para MANAGER / arquivados).
  if (!canArchive || doc.status === 'ARCHIVED') return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="min-h-[44px] min-w-[44px]"
          aria-label={`Ações para ${doc.title}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="text-destructive gap-2" onSelect={() => onArchive(doc)}>
          <Archive className="h-4 w-4" /> Arquivar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DocumentTableHead({ canArchive }: { readonly canArchive: boolean }) {
  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent border-border/60">
        <TableHead scope="col" className="font-semibold text-xs text-foreground">
          Título
        </TableHead>
        <TableHead scope="col" className="font-semibold text-xs text-foreground">
          Status
        </TableHead>
        <TableHead scope="col" className="font-semibold text-xs text-foreground">
          Origem
        </TableHead>
        <TableHead scope="col" className="font-semibold text-xs text-foreground">
          Coleção
        </TableHead>
        <TableHead scope="col" className="font-semibold text-xs text-foreground">
          Agente
        </TableHead>
        <TableHead scope="col" className="font-semibold text-xs text-foreground text-right">
          Atualização
        </TableHead>
        {canArchive && (
          <TableHead scope="col" className="w-12">
            <span className="sr-only">Ações</span>
          </TableHead>
        )}
      </TableRow>
    </TableHeader>
  );
}

export function KnowledgeDocumentTable({
  documents,
  canArchive,
  onArchive,
}: {
  readonly documents: readonly KnowledgeDocumentResponse[];
  readonly canArchive: boolean;
  readonly onArchive: (d: KnowledgeDocumentResponse) => void;
}) {
  return (
    <div className="hidden md:block rounded-lg border border-border/70 bg-card overflow-hidden shadow-xs">
      <Table aria-label="Documentos da base de conhecimento">
        <DocumentTableHead canArchive={canArchive} />
        <TableBody>
          {documents.map((d) => (
            <TableRow
              key={d.id}
              data-testid={`kb-row-${d.id}`}
              className="border-border/40 hover:bg-muted/40"
            >
              <TableCell className="font-medium text-sm max-w-[22rem]">
                <span className="block truncate" title={d.title}>
                  {d.title}
                </span>
              </TableCell>
              <TableCell>
                <KnowledgeStatusBadge status={d.status} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {SOURCE_TYPE_LABELS[d.source.sourceType]}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {d.collection ?? '—'}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {d.agentId ? (
                  <span className="font-mono">{d.agentId.slice(0, 8)}…</span>
                ) : (
                  'Toda a organização'
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground">
                {formatKnowledgeDate(d.updatedAt)}
              </TableCell>
              {canArchive && (
                <TableCell className="text-right">
                  <RowActions doc={d} canArchive={canArchive} onArchive={onArchive} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
