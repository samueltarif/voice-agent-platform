'use client';

import * as React from 'react';
import { Headphones, PhoneCall, TrendingUp, UserCheck } from 'lucide-react';
import { Card, CardContent } from '@voice-agent/ui';
import type { MockKpiSummary } from '../../mocks/dashboard-mock-data';
import { formatPercent } from './dashboard-view-model';

export function KpiMetricCards({ kpis }: { readonly kpis: MockKpiSummary }) {
  const cards = [
    {
      title: 'Ligações hoje',
      value: String(kpis.callsToday),
      subtext: `+${kpis.callsVariationPercent}% vs. ontem`,
      icon: PhoneCall,
      trendPositive: true,
    },
    {
      title: 'Taxa de conexão',
      value: formatPercent(kpis.connectionRatePercent),
      subtext: '+6,2 p.p. de eficácia',
      icon: TrendingUp,
      trendPositive: true,
    },
    {
      title: 'Leads qualificados',
      value: String(kpis.qualifiedLeads),
      subtext: kpis.qualifiedNote,
      icon: UserCheck,
      trendPositive: null,
    },
    {
      title: 'Handoffs humanos',
      value: String(kpis.humanHandoffs),
      subtext: `${kpis.handoffsWaiting} em espera`,
      icon: Headphones,
      trendPositive: null,
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
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  {card.trendPositive !== null && (
                    <span
                      className={
                        card.trendPositive
                          ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                          : 'text-rose-600 dark:text-rose-400 font-medium'
                      }
                    >
                      {card.subtext}
                    </span>
                  )}
                  {card.trendPositive === null && <span>{card.subtext}</span>}
                </div>
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
