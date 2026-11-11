import * as React from 'react';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import type { KnowledgeDocumentResponse } from '@voice-agent/contracts';
import { KnowledgeDialogShell } from './knowledge-dialog-shell';
import type { KnowledgeOperationFailure } from './knowledge-operation-failure';

interface LifecycleDialogProps {
  readonly action: 'restore' | 'delete' | null;
  readonly doc: KnowledgeDocumentResponse | null;
  readonly pending: boolean;
  readonly failure: KnowledgeOperationFailure | null;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

const COPY = {
  restore: {
    title: 'Restaurar documento',
    confirm: 'Restaurar',
    pendingLabel: 'Restaurando...',
    description:
      'O documento volta ao estado Pronto com o mesmo conteúdo e a mesma associação de agente que tinha ao ser arquivado.',
  },
  delete: {
    title: 'Excluir definitivamente',
    confirm: 'Excluir definitivamente',
    pendingLabel: 'Excluindo...',
    description:
      'O documento e todo o seu conteúdo serão apagados e não poderão ser restaurados. O registro de auditoria da exclusão é mantido.',
  },
} as const;

/** Confirmação de restauração e de exclusão definitiva (DEC-054). */
export function KnowledgeLifecycleDialog(props: LifecycleDialogProps) {
  const { action, doc } = props;
  const copy = COPY[action ?? 'restore'];
  const isDelete = action === 'delete';
  return (
    <KnowledgeDialogShell
      open={action !== null && doc !== null}
      testId={isDelete ? 'kb-delete-dialog' : 'kb-restore-dialog'}
      title={copy.title}
      icon={
        isDelete ? (
          <Trash2 className="h-5 w-5 text-destructive" aria-hidden="true" />
        ) : (
          <ArchiveRestore className="h-5 w-5 text-primary" aria-hidden="true" />
        )
      }
      description={copy.description}
      pending={props.pending}
      failure={props.failure}
      confirmLabel={copy.confirm}
      pendingLabel={copy.pendingLabel}
      destructive={isDelete}
      onClose={props.onClose}
      onConfirm={props.onConfirm}
    >
      <p className="py-2 text-xs text-foreground">
        Documento: <span className="font-semibold break-words">{doc?.title}</span>
      </p>
    </KnowledgeDialogShell>
  );
}
