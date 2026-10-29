'use client';

import * as React from 'react';
import { Button } from '@voice-agent/ui';
import type { CampaignAction } from '@voice-agent/contracts';
import { CAMPAIGN_ACTION_LABELS } from './campaign-labels';

interface CampaignActionsBarProps {
  readonly actions: readonly CampaignAction[];
  readonly pending: boolean;
  readonly onAction: (action: CampaignAction) => void;
}

/** Cancelar é irreversível: exige uma segunda confirmação explícita (sem diálogo nativo). */
export function CampaignActionsBar({ actions, pending, onAction }: CampaignActionsBarProps) {
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  if (actions.length === 0) {
    return (
      <p data-testid="campaign-actions-none" className="text-xs text-muted-foreground">
        Nenhuma ação disponível para esta campanha com o seu papel.
      </p>
    );
  }
  if (confirmCancel) {
    return (
      <div
        role="group"
        aria-label="Confirmar cancelamento"
        className="flex flex-wrap items-center gap-2"
      >
        <span className="text-sm">
          Cancelar retira todos os contatos ainda não discados. Confirmar?
        </span>
        <Button
          variant="destructive"
          disabled={pending}
          className="min-h-[44px]"
          onClick={() => {
            setConfirmCancel(false);
            onAction('CANCEL');
          }}
        >
          Sim, cancelar campanha
        </Button>
        <Button variant="outline" className="min-h-[44px]" onClick={() => setConfirmCancel(false)}>
          Voltar
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2" data-testid="campaign-actions">
      {actions.map((action) => (
        <Button
          key={action}
          variant={action === 'CANCEL' ? 'outline' : 'default'}
          disabled={pending}
          className="min-h-[44px]"
          onClick={() => (action === 'CANCEL' ? setConfirmCancel(true) : onAction(action))}
        >
          {CAMPAIGN_ACTION_LABELS[action]}
        </Button>
      ))}
    </div>
  );
}
