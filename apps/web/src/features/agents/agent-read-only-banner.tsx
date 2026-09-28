import * as React from 'react';
import { Card, CardContent, Button } from '@voice-agent/ui';
import { Lock, Info, Archive, FilePlus, Loader2 } from 'lucide-react';
import type { AgentVersionStatus } from '@voice-agent/contracts';

export interface AgentReadOnlyBannerProps {
  readonly versionNumber: number;
  readonly status: AgentVersionStatus | string;
  readonly isAgentArchived?: boolean | undefined;
  readonly canCreateDraft?: boolean | undefined;
  readonly isCreatingDraft?: boolean | undefined;
  readonly onCreateDraft?: (() => void) | undefined;
}

function ArchivedAgentCard() {
  return (
    <Card
      className="border-amber-500/30 bg-amber-500/5 shadow-xs"
      data-testid="agent-archived-banner"
    >
      <CardContent className="flex items-start gap-3 p-4">
        <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
          <Archive className="h-4 w-4" />
        </div>
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-foreground">Agente Arquivado</h4>
          <p className="text-[11px] text-muted-foreground">
            Este agente está arquivado e não aceita edições ou publicações de rascunhos. Reative-o
            para continuar seu gerenciamento.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface BannerNoticeProps {
  readonly isPublished: boolean;
  readonly versionNumber: number;
}

function BannerNoticeContent({ isPublished, versionNumber }: BannerNoticeProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
        {isPublished ? <Lock className="h-4 w-4" /> : <Info className="h-4 w-4" />}
      </div>
      <div className="space-y-0.5">
        <h4 className="text-xs font-semibold text-foreground">
          {isPublished
            ? `Versão v${versionNumber} (Publicada) — Somente Leitura`
            : `Versão v${versionNumber} (Arquivada) — Somente Leitura`}
        </h4>
        <p className="text-[11px] text-muted-foreground">
          {isPublished
            ? 'Versões publicadas são imutáveis para garantir estabilidade e rastreabilidade. Para realizar alterações, crie ou edite um rascunho.'
            : 'Versões arquivadas são mantidas apenas para histórico e auditoria, não podendo ser alteradas.'}
        </p>
      </div>
    </div>
  );
}

interface CreateDraftButtonProps {
  readonly isCreatingDraft: boolean;
  readonly onCreateDraft: () => void;
}

function CreateDraftButton({ isCreatingDraft, onCreateDraft }: CreateDraftButtonProps) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onCreateDraft}
      disabled={isCreatingDraft}
      data-testid="btn-create-draft"
      className="gap-2 h-9 text-xs min-h-[44px] shrink-0"
    >
      {isCreatingDraft ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Criando rascunho...</span>
        </>
      ) : (
        <>
          <FilePlus className="h-3.5 w-3.5" />
          <span>Criar novo rascunho</span>
        </>
      )}
    </Button>
  );
}

export function AgentReadOnlyBanner({
  versionNumber,
  status,
  isAgentArchived = false,
  canCreateDraft = false,
  isCreatingDraft = false,
  onCreateDraft,
}: AgentReadOnlyBannerProps) {
  if (isAgentArchived) {
    return <ArchivedAgentCard />;
  }

  const isPublished = status === 'PUBLISHED';
  const showCreateDraft = canCreateDraft && Boolean(onCreateDraft);

  return (
    <Card className="border-border/80 bg-muted/30 shadow-xs" data-testid="version-read-only-banner">
      <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4">
        <BannerNoticeContent isPublished={isPublished} versionNumber={versionNumber} />
        {showCreateDraft && onCreateDraft && (
          <CreateDraftButton isCreatingDraft={isCreatingDraft} onCreateDraft={onCreateDraft} />
        )}
      </CardContent>
    </Card>
  );
}
