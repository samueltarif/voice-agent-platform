'use client';

import * as React from 'react';
import { Plus, Upload } from 'lucide-react';
import { Button } from '@voice-agent/ui';
import { TenantShell } from '../../shell/tenant-shell';
import { MOCK_DASHBOARD_DATA } from '../../mocks/dashboard-mock-data';
import { KpiMetricCards } from '../../features/dashboard/kpi-metric-cards';
import { LiveCallsPanel } from '../../features/dashboard/live-calls-panel';
import { CampaignStatusCard } from '../../features/dashboard/campaign-status-card';
import { HumanHandoffQueueCard } from '../../features/dashboard/human-handoff-queue-card';
import { RecentCallsView } from '../../features/dashboard/recent-calls-view';
import { OrganizationAgentsCard } from '../../features/dashboard/organization-agents-card';

export default function DashboardPage() {
  const data = MOCK_DASHBOARD_DATA;

  return (
    <TenantShell title="Central de Operações">
      <div className="space-y-6">
        {/* Page Header with Action Buttons */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Central de operações
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Acompanhe ligações, leads, campanhas e handoffs em tempo real.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2 h-9 text-xs">
              <Upload className="h-3.5 w-3.5" />
              <span>Importar leads</span>
            </Button>
            <Button size="sm" className="gap-2 h-9 text-xs shadow-xs">
              <Plus className="h-3.5 w-3.5" />
              <span>Nova campanha</span>
            </Button>
          </div>
        </div>

        {/* 4 KPI Metric Cards */}
        <KpiMetricCards kpis={data.kpis} />

        {/* Tenant Organization Agents */}
        <OrganizationAgentsCard />

        {/* Live Operations Row: 2 balanced columns on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
          <LiveCallsPanel calls={data.liveCalls} />

          <div className="space-y-6">
            <CampaignStatusCard campaign={data.activeCampaign} />
            <HumanHandoffQueueCard queue={data.handoffQueue} />
          </div>
        </div>

        {/* Recent Calls Data Table / Cards */}
        <RecentCallsView calls={data.recentCalls} />
      </div>
    </TenantShell>
  );
}
