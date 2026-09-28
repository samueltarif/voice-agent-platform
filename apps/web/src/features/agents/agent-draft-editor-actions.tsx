import * as React from 'react';
import { Button } from '@voice-agent/ui';

interface AgentDraftEditorActionsProps {
  readonly isDirty: boolean;
  readonly readOnly: boolean;
  readonly isSaving: boolean;
  readonly isDiscarding: boolean;
  readonly errorMessage: string | null;
  readonly savedSuccess: boolean;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
}

function DraftStatusBadge({ isDirty }: { readonly isDirty: boolean }) {
  if (isDirty) {
    return (
      <span
        data-testid="status-dirty"
        className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20"
      >
        Alterações não salvas
      </span>
    );
  }
  return (
    <span
      data-testid="status-saved"
      className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
    >
      Sincronizado
    </span>
  );
}

function DraftActionButtons({
  isSaving,
  isDiscarding,
  isDirty,
  onSave,
  onDiscard,
}: {
  readonly isSaving: boolean;
  readonly isDiscarding: boolean;
  readonly isDirty: boolean;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
}) {
  return (
    <div className="flex items-center gap-2 w-full sm:w-auto">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onDiscard}
        disabled={isSaving || isDiscarding}
        className="text-xs text-destructive hover:bg-destructive/10"
        data-testid="btn-discard-draft"
      >
        {isDiscarding ? 'Descartando...' : 'Descartar rascunho'}
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={onSave}
        disabled={isSaving || isDiscarding || !isDirty}
        className="text-xs"
        data-testid="btn-save-draft"
      >
        {isSaving ? 'Salvando...' : 'Salvar rascunho'}
      </Button>
    </div>
  );
}

function DraftAlerts({
  errorMessage,
  savedSuccess,
}: {
  readonly errorMessage: string | null;
  readonly savedSuccess: boolean;
}) {
  if (errorMessage) {
    return (
      <div
        data-testid="save-error-banner"
        className="p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs"
      >
        {errorMessage}
      </div>
    );
  }
  if (savedSuccess) {
    return (
      <div
        data-testid="save-success-banner"
        className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs"
      >
        Rascunho salvo com sucesso!
      </div>
    );
  }
  return null;
}

export function AgentDraftEditorActions({
  isDirty,
  readOnly,
  isSaving,
  isDiscarding,
  errorMessage,
  savedSuccess,
  onSave,
  onDiscard,
}: AgentDraftEditorActionsProps) {
  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg bg-card border border-border/80 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Editor de Rascunho</span>
            <DraftStatusBadge isDirty={isDirty} />
          </div>
          <p className="text-xs text-muted-foreground">
            Ajuste as definições e salve seu rascunho para mantê-lo atualizado.
          </p>
        </div>

        {!readOnly && (
          <DraftActionButtons
            isSaving={isSaving}
            isDiscarding={isDiscarding}
            isDirty={isDirty}
            onSave={onSave}
            onDiscard={onDiscard}
          />
        )}
      </div>

      <DraftAlerts errorMessage={errorMessage} savedSuccess={savedSuccess} />
    </>
  );
}
