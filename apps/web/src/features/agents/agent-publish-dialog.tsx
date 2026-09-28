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
import { Loader2, Send } from 'lucide-react';

interface AgentPublishDialogProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly versionNumber: number;
  readonly isPublishing: boolean;
  readonly onConfirmPublish: () => void;
}

export function AgentPublishDialog({
  isOpen,
  onOpenChange,
  versionNumber,
  isPublishing,
  onConfirmPublish,
}: AgentPublishDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="publish-confirm-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Send className="h-5 w-5 text-primary" />
            <span>Publicar Versão</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-2">
            Esta versão passará a ser a versão publicada do agente. Ela se tornará a versão ativa e
            quaisquer versões publicadas anteriormente serão arquivadas no histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 text-xs">
          <p className="font-semibold text-foreground">
            Confirma a publicação da versão{' '}
            <span className="font-mono text-primary font-bold">{`v${versionNumber}`}</span>?
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPublishing}
            className="min-h-[44px] text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onConfirmPublish}
            disabled={isPublishing}
            className="min-h-[44px] text-xs gap-2"
            data-testid="btn-confirm-publish"
          >
            {isPublishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Publicando...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Publicar versão</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
