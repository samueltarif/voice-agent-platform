import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@voice-agent/ui';
import { Archive, CheckCircle2, Loader2 } from 'lucide-react';

interface AgentArchiveDialogProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mode: 'archive' | 'reactivate';
  readonly agentName: string;
  readonly isPending: boolean;
  readonly onConfirm: () => void;
}

function ArchiveHeaderContent({ isArchive }: { readonly isArchive: boolean }) {
  if (isArchive) {
    return (
      <>
        <DialogTitle className="flex items-center gap-2 text-foreground">
          <Archive className="h-5 w-5 text-destructive" />
          <span>Arquivar Agente</span>
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground pt-2">
          Ao arquivar o agente, ele se tornará inativo. Edições e publicações de rascunho serão
          bloqueadas até que o agente seja reativado.
        </DialogDescription>
      </>
    );
  }
  return (
    <>
      <DialogTitle className="flex items-center gap-2 text-foreground">
        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        <span>Reativar Agente</span>
      </DialogTitle>
      <DialogDescription className="text-xs text-muted-foreground pt-2">
        Ao reativar o agente, ele retornará ao status ativo, permitindo edições e publicações
        normalmente.
      </DialogDescription>
    </>
  );
}

function ArchiveSubmitButton({
  isArchive,
  isPending,
  onConfirm,
}: {
  readonly isArchive: boolean;
  readonly isPending: boolean;
  readonly onConfirm: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={isArchive ? 'destructive' : 'default'}
      onClick={onConfirm}
      disabled={isPending}
      className="min-h-[44px] text-xs gap-2"
      data-testid={isArchive ? 'btn-confirm-archive' : 'btn-confirm-reactivate'}
    >
      {isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{isArchive ? 'Arquivando...' : 'Reativando...'}</span>
        </>
      ) : isArchive ? (
        <>
          <Archive className="h-4 w-4" />
          <span>Arquivar agente</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-4 w-4" />
          <span>Reativar agente</span>
        </>
      )}
    </Button>
  );
}

export function AgentArchiveDialog({
  isOpen,
  onOpenChange,
  mode,
  agentName,
  isPending,
  onConfirm,
}: AgentArchiveDialogProps) {
  const isArchive = mode === 'archive';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="archive-confirm-dialog">
        <DialogHeader>
          <ArchiveHeaderContent isArchive={isArchive} />
        </DialogHeader>

        <div className="py-2 text-xs">
          <p className="text-foreground">
            {isArchive ? 'Deseja realmente arquivar ' : 'Deseja realmente reativar '}
            <span className="font-semibold text-foreground">{agentName}</span>?
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="min-h-[44px] text-xs"
          >
            Cancelar
          </Button>
          <ArchiveSubmitButton isArchive={isArchive} isPending={isPending} onConfirm={onConfirm} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
