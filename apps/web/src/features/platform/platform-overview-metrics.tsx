'use client';

import * as React from 'react';
import { Building2, CheckCircle2, Clock, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@voice-agent/ui';
import type { MockPlatformOverview } from '../../mocks/platform-mock-data';
import { formatCurrencyBrl } from '../dashboard/dashboard-view-model';

export function PlatformOverviewMetrics({ overview }: { readonly overview: MockPlatformOverview }) {
  const cards = [
    {
      title: 'Organizações Registradas',
      value: String(overview.totalOrganizations),
      subtext: 'Clientes multi-tenant cadastrados',
      icon: Building2,
    },
    {
      title: 'Assinaturas Ativas',
      value: String(overview.activeSubscriptions),
      subtext: 'Planos corporativos em vigência',
      icon: CheckCircle2,
    },
    {
      title: 'Minutos Consumidos (Mês)',
      value: `${overview.minutesConsumed.toLocaleString('pt-BR')} min`,
      subtext: 'Tráfego de voz em telecom',
      icon: Clock,
    },
    {
      title: 'Custos de Infraestrutura',
      value: formatCurrencyBrl(overview.providerCostCents),
      subtext: 'Telefonia + IA Realtime (Custo direto)',
      icon: DollarSign,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title} className="p-4 sm:p-5">
            <CardContent className="p-0 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{card.title}</span>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {card.value}
                </div>
                <div className="text-xs text-muted-foreground">{card.subtext}</div>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <Icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
