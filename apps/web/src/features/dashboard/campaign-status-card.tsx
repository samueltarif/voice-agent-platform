'use client';

import * as React from 'react';
import { Activity } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle, Progress } from '@voice-agent/ui';
import type { MockCampaignProgress } from '../../mocks/dashboard-mock-data';
import { calculateCampaignProgressPercent, formatCurrencyBrl } from './dashboard-view-model';

export function CampaignStatusCard({ campaign }: { readonly campaign: MockCampaignProgress }) {
  const percent = calculateCampaignProgressPercent(campaign.processedLeads, campaign.totalLeads);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold truncate">{campaign.name}</CardTitle>
        </div>
        <Badge variant="success" className="text-xs shrink-0">
          Ativo
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5 font-medium">
            <span>Progresso da lista</span>
            <span>
              {campaign.processedLeads} / {campaign.totalLeads} leads ({percent}%)
            </span>
          </div>
          <Progress value={percent} className="h-2" />
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
          <div className="rounded-lg bg-muted/40 p-2.5">
            <div className="text-base font-bold text-foreground">{campaign.connectedLeads}</div>
            <div className="text-[11px] text-muted-foreground">Atendidos</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5">
            <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
              {campaign.qualifiedLeads}
            </div>
            <div className="text-[11px] text-muted-foreground">Qualificados</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5">
            <div className="text-base font-bold text-foreground">
              {formatCurrencyBrl(campaign.costCents)}
            </div>
            <div className="text-[11px] text-muted-foreground">Custo acumulado</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
