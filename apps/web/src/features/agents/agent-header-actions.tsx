import * as React from 'react';
import { Send, Archive, CheckCircle2 } from 'lucide-react';
import { Button } from '@voice-agent/ui';

interface PublishButtonProps {
  readonly visible: boolean;
  readonly onClick?: (() => void) | undefined;
}

function PublishButton({ visible, onClick }: PublishButtonProps) {
  if (!visible || !onClick) return null;
  return (
    <Button
      size="sm"
      onClick={onClick}
      data-testid="btn-publish-draft"
      className="gap-1.5 h-8 text-xs min-h-[44px]"
    >
      <Send className="h-3.5 w-3.5" />
      <span>Publicar rascunho</span>
    </Button>
  );
}

interface ArchiveButtonProps {
  readonly canArchive: boolean;
  readonly isArchived: boolean;
  readonly onOpenArchive?: (() => void) | undefined;
  readonly onOpenReactivate?: (() => void) | undefined;
}

function ArchiveButton({
  canArchive,
  isArchived,
  onOpenArchive,
  onOpenReactivate,
}: ArchiveButtonProps) {
  if (!canArchive) return null;
  if (isArchived && onOpenReactivate) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={onOpenReactivate}
        data-testid="btn-reactivate-agent"
        className="gap-1.5 h-8 text-xs min-h-[44px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>Reativar agente</span>
      </Button>
    );
  }
  if (!isArchived && onOpenArchive) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={onOpenArchive}
        data-testid="btn-archive-agent"
        className="gap-1.5 h-8 text-xs min-h-[44px] text-muted-foreground hover:text-destructive"
      >
        <Archive className="h-3.5 w-3.5" />
        <span>Arquivar</span>
      </Button>
    );
  }
  return null;
}

export interface AgentHeaderActionsProps {
  readonly isArchived: boolean;
  readonly canPublish: boolean;
  readonly canArchive: boolean;
  readonly hasDraft: boolean;
  readonly onOpenPublish?: (() => void) | undefined;
  readonly onOpenArchive?: (() => void) | undefined;
  readonly onOpenReactivate?: (() => void) | undefined;
}

export function AgentHeaderActions({
  isArchived,
  canPublish,
  canArchive,
  hasDraft,
  onOpenPublish,
  onOpenArchive,
  onOpenReactivate,
}: AgentHeaderActionsProps) {
  const showPublish = canPublish && hasDraft && !isArchived;

  return (
    <div className="flex items-center gap-2">
      <PublishButton visible={showPublish} onClick={onOpenPublish} />
      <ArchiveButton
        canArchive={canArchive}
        isArchived={isArchived}
        onOpenArchive={onOpenArchive}
        onOpenReactivate={onOpenReactivate}
      />
    </div>
  );
}
