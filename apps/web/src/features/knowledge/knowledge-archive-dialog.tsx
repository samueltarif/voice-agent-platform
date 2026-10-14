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
import { KnowledgeErrorState, kindFromStatus } from './knowledge-error-state';

interface Props {
  readonly isOpen: boolean;
  readonly documentTitle: string;
  readonly isPending: boolean;
  readonly errorStatus?: number | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}

export function KnowledgeArchiveDialog({
  isOpen,
  documentTitle,
  isPending,
  errorStatus,
  onOpenChange,
  onConfirm,
}: Props) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(o) => {
        if (!isPending) onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[460px]" data-testid="kb-archive-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Archive className="h-5 w-5 text-destructive" aria-hidden="true" />
            <span>Arquivar documento</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-2">
            Ao arquivar, o documento deixa de ser usado como conhecimento e não pode ser reativado
            por esta tela.
          </DialogDescription>
        </DialogHeader>
        <p className="py-2 text-xs text-foreground">
          Deseja realmente arquivar{' '}
          <span className="font-semibold break-words">{documentTitle}</span>?
        </p>
        {errorStatus !== undefined && (
          <KnowledgeErrorState kind={kindFromStatus(errorStatus)} compact />
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
