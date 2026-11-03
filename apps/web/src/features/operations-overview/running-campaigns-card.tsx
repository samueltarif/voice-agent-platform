import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@voice-agent/ui';
import type { OperationsOverview } from '@voice-agent/contracts';
import { CampaignStatusBadge } from '../campaigns/campaign-status-badge';
import { campaignSettledPercent } from '../campaigns/campaign-labels';

interface RunningCampaignsCardProps {
  readonly orgSlug: string;
  readonly campaigns: OperationsOverview['campaigns'];
}

/** Campanhas ativas/pausadas com progresso real (retidos pela pausa à parte). */
export function RunningCampaignsCard({ orgSlug, campaigns }: RunningCampaignsCardProps) {
  const { byStatus, running } = campaigns;
  return (
    <Card className="border-border/60 shadow-xs" data-testid="running-campaigns">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Campanhas em execução</CardTitle>
        <p className="text-xs text-muted-foreground">
          {byStatus.ACTIVE} ativa(s) · {byStatus.PAUSED} pausada(s) · {byStatus.DRAFT} rascunho(s)
        </p>
      </CardHeader>
      <CardContent>
        {running.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="running-campaigns-empty">
            Nenhuma campanha ativa ou pausada.{' '}
            <Link className="underline" href={`/orgs/${orgSlug}/campaigns`}>
              Ver campanhas
            </Link>
          </p>
        ) : (
          <ul role="list" className="divide-y divide-border">
            {running.map((c) => (
              <li key={c.campaignId} className="space-y-1 py-3">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    className="truncate text-sm font-semibold hover:underline"
                    href={`/orgs/${orgSlug}/campaigns/${c.campaignId}/report`}
                  >
                    {c.name}
                  </Link>
                  <CampaignStatusBadge status={c.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.progress.total} contatos · {c.progress.inProgress} em andamento ·{' '}
                  {c.progress.heldByPause} retidos pela pausa · {c.progress.scheduled} agendados ·{' '}
                  {campaignSettledPercent(c.progress)}% finalizados
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
