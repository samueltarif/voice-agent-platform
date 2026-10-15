import * as React from 'react';
import { Archive, Loader2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@voice-agent/ui';
import { KnowledgeErrorState } from './knowledge-error-state';
import { kindFromFailure } from './knowledge-failure';

interface Props {
  readonly isOpen: boolean;
  readonly documentTitle: string;
  readonly isPending: boolean;
  readonly errorStatus?: number | undefined;
  readonly errorCode?: string | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCloseAutoFocus?: ((event: Event) => void) | undefined;
  readonly onConfirm: () => void;
}

function ConfirmArchiveButton({
  isPending,
  onConfirm,
}: {
  readonly isPending: boolean;
  readonly onConfirm: () => void;
}) {
  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      className="min-h-[44px] text-xs gap-2"
      disabled={isPending}
      onClick={onConfirm}
      data-testid="kb-confirm-archive"
    >
      {isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Arquivando...</span>
        </>
      ) : (
        <>
          <Archive className="h-4 w-4" />
          <span>Confirmar arquivamento</span>
        </>
      )}
    </Button>
  );
}

export function KnowledgeArchiveDialog({
  isOpen,
  documentTitle,
  isPending,
  errorStatus,
  errorCode,
  onOpenChange,
  onCloseAutoFocus,
  onConfirm,
}: Props) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(o) => {
        if (!isPending) onOpenChange(o);
      }}
    >
      <DialogContent
        className="sm:max-w-[460px]"
        data-testid="kb-archive-dialog"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Archive className="h-5 w-5 text-destructive" aria-hidden="true" />
            <span>Arquivar documento</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-2">
            O documento será marcado como arquivado. Esta ação não pode ser desfeita por esta tela.
          </DialogDescription>
        </DialogHeader>
        <p className="py-2 text-xs text-foreground">
          Deseja realmente arquivar{' '}
          <span className="font-semibold break-words">{documentTitle}</span>?
        </p>
        {errorStatus !== undefined && (
          <KnowledgeErrorState
            kind={kindFromFailure({ status: errorStatus, code: errorCode }, 'archive')}
            compact
          />
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[44px] text-xs"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <ConfirmArchiveButton isPending={isPending} onConfirm={onConfirm} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
