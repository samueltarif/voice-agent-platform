'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, FilePlus, Loader2, ShieldAlert } from 'lucide-react';
import { Button, Card, CardContent } from '@voice-agent/ui';

interface AgentDraftBannerProps {
  readonly agentId: string;
  readonly canEdit: boolean;
  readonly canReadConfig: boolean;
  readonly hasDraft: boolean;
}

function RestrictedDraftNotice() {
  return (
    <Card className="border-border/70 shadow-xs">
      <CardContent className="flex items-start gap-3 p-6">
        <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Visualização Restrita</h3>
          <p className="text-xs text-muted-foreground">
            Apenas administradores e gerentes possuem permissão para visualizar e editar as
            configurações detalhadas de IA deste agente.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyDraftContent({
  canEdit,
  creating,
  error,
  onCreate,
}: {
  readonly canEdit: boolean;
  readonly creating: boolean;
  readonly error: string | null;
  readonly onCreate: () => void;
}) {
  return (
    <Card className="border-dashed border-2 border-border/70 shadow-xs">
      <CardContent className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
          <FilePlus className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Nenhum rascunho em edição</h3>
        <p className="text-xs text-muted-foreground max-w-md mb-5">
          {canEdit
            ? 'Crie um novo rascunho para começar a editar a persona, regras, playbook e exemplos deste agente.'
            : 'Não há rascunhos de configuração abertos no momento.'}
        </p>
        {error && (
          <div className="mb-4 flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-1.5 rounded">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}
        {canEdit && (
          <Button
            size="sm"
            onClick={onCreate}
            disabled={creating}
            className="gap-2 h-9 text-xs min-h-[44px]"
            data-testid="btn-create-draft"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Criando rascunho...</span>
              </>
            ) : (
              <>
                <FilePlus className="h-4 w-4" />
                <span>Criar rascunho</span>
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function AgentDraftBanner({
  agentId,
  canEdit,
  canReadConfig,
  hasDraft,
}: AgentDraftBannerProps) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!canReadConfig) {
    return <RestrictedDraftNotice />;
  }

  if (hasDraft) return null;

  const handleCreateDraft = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Falha ao criar rascunho.');
        setCreating(false);
        return;
      }

      router.refresh();
    } catch {
      setError('Erro de conexão ao criar rascunho.');
      setCreating(false);
    }
  };

  return (
    <EmptyDraftContent
      canEdit={canEdit}
      creating={creating}
      error={error}
      onCreate={handleCreateDraft}
    />
  );
}
