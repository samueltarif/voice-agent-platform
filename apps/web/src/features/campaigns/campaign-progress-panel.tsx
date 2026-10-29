import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@voice-agent/ui';
import type { CampaignProgress } from '@voice-agent/contracts';
import { CAMPAIGN_PROGRESS_ROWS, campaignSettledPercent } from './campaign-labels';

/** Progresso REAL agregado dos jobs (nenhum número simulado). */
export function CampaignProgressPanel({ progress }: { readonly progress: CampaignProgress }) {
  const percent = campaignSettledPercent(progress);
  return (
    <Card className="border-border/60 shadow-xs" data-testid="campaign-progress">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Progresso</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {progress.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum contato agendado. Os contatos elegíveis são agendados ao iniciar a campanha.
          </p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.total} contatos agendados no total</span>
              <span>{percent}% finalizados</span>
            </div>
            <div
              role="progressbar"
              aria-label="Contatos finalizados"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {CAMPAIGN_PROGRESS_ROWS.map((row) => (
            <div key={row.key} className="rounded-md border border-border/60 p-3">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {row.label}
              </dt>
              <dd className="text-lg font-bold" data-testid={`campaign-progress-${row.key}`}>
                {progress[row.key]}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
