import * as React from 'react';
import { Loader2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@voice-agent/ui';
import type { KnowledgeOperationFailure } from './knowledge-operation-failure';

export interface KnowledgeDialogShellProps {
  readonly open: boolean;
  readonly testId: string;
  readonly title: string;
  readonly icon: React.ReactNode;
  readonly description: React.ReactNode;
  readonly pending: boolean;
  readonly failure: KnowledgeOperationFailure | null;
  readonly confirmLabel: string;
  readonly pendingLabel: string;
  readonly destructive?: boolean;
  readonly confirmDisabled?: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly children?: React.ReactNode;
}

/** Falha da operação, com dica de recarregar quando a versão ficou desatualizada. */
export function KnowledgeOperationAlert({
  failure,
}: {
  readonly failure: KnowledgeOperationFailure;
}) {
  return (
    <div
      role="alert"
      data-testid="kb-operation-error"
      className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
    >
      <p>{failure.message}</p>
      {failure.reloadHint && (
        <p className="pt-1 font-medium">
          Feche esta janela e atualize a página para ver a versão atual.
        </p>
      )}
    </div>
  );
}

/** Estrutura comum dos diálogos de gestão: título, explicação, erro e confirmação. */
export function KnowledgeDialogShell(props: KnowledgeDialogShellProps) {
  const { open, pending, failure, onClose, onConfirm } = props;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-[520px]" data-testid={props.testId}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            {props.icon}
            <span>{props.title}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-2">
            {props.description}
          </DialogDescription>
        </DialogHeader>
        {props.children}
        {failure && <KnowledgeOperationAlert failure={failure} />}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[44px] text-xs"
            disabled={pending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant={props.destructive ? 'destructive' : 'default'}
            size="sm"
            className="min-h-[44px] text-xs gap-2"
            disabled={pending || props.confirmDisabled}
            onClick={onConfirm}
            data-testid={`${props.testId}-confirm`}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            <span>{pending ? props.pendingLabel : props.confirmLabel}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
