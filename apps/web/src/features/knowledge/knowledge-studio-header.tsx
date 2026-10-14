import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@voice-agent/ui';

export function KnowledgeStudioHeader({
  canIngest,
  onAdd,
}: {
  readonly canIngest: boolean;
  readonly onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Base de Conhecimento
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Documentos de referência usados pelos agentes da organização.
        </p>
      </div>
      {canIngest && (
        <Button size="sm" className="gap-2 min-h-[44px] text-xs shadow-xs" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Adicionar conhecimento
        </Button>
      )}
    </div>
  );
}
