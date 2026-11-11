import * as React from 'react';
import { Archive, ArchiveRestore, Bot, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@voice-agent/ui';
import type { KnowledgeDocumentResponse } from '@voice-agent/contracts';
import {
  availableKnowledgeActions,
  type KnowledgeDocumentAction,
  type KnowledgeManagePermissions,
} from './knowledge-document-actions';

/** Gestão completa da linha: recebida pela lista quando o estúdio habilita a gestão. */
export interface KnowledgeManageProps {
  readonly permissions: KnowledgeManagePermissions;
  readonly agentNames: ReadonlyMap<string, string>;
  readonly onAction: (action: KnowledgeDocumentAction, doc: KnowledgeDocumentResponse) => void;
}

const ITEMS: Readonly<
  Record<KnowledgeDocumentAction, { label: string; icon: React.ReactNode; danger?: boolean }>
> = {
  edit: { label: 'Editar', icon: <Pencil className="h-4 w-4" /> },
  associate: { label: 'Associar a agente', icon: <Bot className="h-4 w-4" /> },
  archive: { label: 'Arquivar', icon: <Archive className="h-4 w-4" />, danger: true },
  restore: { label: 'Restaurar', icon: <ArchiveRestore className="h-4 w-4" /> },
  delete: { label: 'Excluir definitivamente', icon: <Trash2 className="h-4 w-4" />, danger: true },
};

export function KnowledgeRowActionsMenu({
  doc,
  manage,
}: {
  readonly doc: KnowledgeDocumentResponse;
  readonly manage: KnowledgeManageProps;
}) {
  const actions = availableKnowledgeActions(doc, manage.permissions);
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="min-h-[44px] min-w-[44px]"
          aria-label={`Ações para ${doc.title}`}
          data-testid={`kb-actions-${doc.id}`}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action}
            data-testid={`kb-action-${action}`}
            className={`gap-2 ${ITEMS[action].danger ? 'text-rose-700 dark:text-rose-300' : ''}`}
            onSelect={() => manage.onAction(action, doc)}
          >
            {ITEMS[action].icon} {ITEMS[action].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
