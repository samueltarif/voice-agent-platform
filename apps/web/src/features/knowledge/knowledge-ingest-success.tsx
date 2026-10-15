import * as React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@voice-agent/ui';

export function IngestSuccessPanel({
  duplicate,
  onAddAnother,
  onDone,
}: {
  readonly duplicate: boolean;
  readonly onAddAnother: () => void;
  readonly onDone: () => void;
}) {
  return (
    <div
      className="py-10 flex flex-col items-center text-center gap-3"
      role="status"
      data-testid="kb-ingest-success"
    >
      <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden="true" />
      <h3 className="text-base font-semibold">
        {duplicate ? 'Documento já cadastrado' : 'Documento cadastrado'}
      </h3>
      <p className="text-xs text-muted-foreground max-w-xs">
        {duplicate
          ? 'Este conteúdo já existia; nenhum documento novo foi criado.'
          : 'O documento foi enviado e será processado.'}
      </p>
      <div className="flex gap-2 pt-2">
        <Button size="sm" variant="outline" className="min-h-[44px] text-xs" onClick={onAddAnother}>
          Adicionar outro
        </Button>
        <Button size="sm" className="min-h-[44px] text-xs" onClick={onDone}>
          Concluir
        </Button>
      </div>
    </div>
  );
}
