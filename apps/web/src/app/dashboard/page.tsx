import * as React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Upload } from 'lucide-react';
import { Button } from '@voice-agent/ui';
import type { OperationsAttemptRow, OperationsOverview } from '@voice-agent/contracts';
import { TenantShell } from '../../shell/tenant-shell';
import { OrganizationAgentsCard } from '../../features/dashboard/organization-agents-card';
import { AttemptsTable } from '../../features/campaign-reports/campaign-attempts-table';
import { CampaignReportCosts } from '../../features/campaign-reports/campaign-report-costs';
import { AttemptOutcomeCard } from '../../features/campaign-reports/campaign-report-summary';
import { ATTEMPTS_PAGE_SIZE } from '../../features/campaign-reports/report-labels';
import { OperationsLoadError } from '../../features/operations/operations-load-error';
import { NoOrganizationState } from '../../features/operations-overview/no-organization-state';
import { OperationsKpis } from '../../features/operations-overview/operations-kpis';
import { OperationsNotices } from '../../features/operations-overview/operations-notices';
import { RunningCampaignsCard } from '../../features/operations-overview/running-campaigns-card';
import {
  CONTEXT_UNAVAILABLE_MESSAGE,
  resolveOverviewContext,
  type OverviewPageContext,
} from '../../features/operations-overview/load-tenant-overview';

const PERIOD_DAYS = 7;
const PERIOD = { days: String(PERIOD_DAYS) } as const;

type Ready = Extract<OverviewPageContext, { kind: 'READY' }>;

async function loadDashboard(page: Ready) {
  try {
    const [overview, attempts] = await Promise.all([
      page.tenant.request<OperationsOverview>({
        method: 'GET',
        path: `/v1/operations/overview?days=${PERIOD_DAYS}`,
      }),
      page.tenant.request<OperationsAttemptRow[]>({
        method: 'GET',
        path: `/v1/operations/attempts?days=${PERIOD_DAYS}&limit=${ATTEMPTS_PAGE_SIZE + 1}`,
      }),
    ]);
    return { overview, attempts };
  } catch {
    return null;
  }
}

function DashboardContent(props: {
  readonly orgSlug: string;
  readonly overview: OperationsOverview;
  readonly attempts: OperationsAttemptRow[];
}) {
  const { orgSlug, overview } = props;
  return (
    <div className="space-y-6">
      <OperationsKpis overview={overview} />
      <OrganizationAgentsCard />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <RunningCampaignsCard orgSlug={orgSlug} campaigns={overview.campaigns} />
        <OperationsNotices />
      </div>
      <AttemptOutcomeCard
        attempts={overview.attempts}
        title={`Tentativas dos últimos ${overview.periodDays} dias`}
      />
      <CampaignReportCosts
        costs={overview.costs}
        settledNote={`nos últimos ${overview.periodDays} dias`}
      />
      <AttemptsTable
        orgSlug={orgSlug}
        endpoint="/api/operations/attempts"
        fixedParams={PERIOD}
        initial={props.attempts}
        title="Tentativas recentes"
      />
    </div>
  );
}

export default async function DashboardPage() {
  const page = await resolveOverviewContext();
  if (page.kind === 'UNAUTHENTICATED') {
    redirect('/login');
    return null;
  }
  if (page.kind === 'NO_ORGANIZATION') {
    return (
      <TenantShell title="Central de Operações">
        <NoOrganizationState />
      </TenantShell>
    );
  }
  if (page.kind === 'CONTEXT_UNAVAILABLE') {
    return (
      <TenantShell title="Central de Operações">
        <OperationsLoadError message={CONTEXT_UNAVAILABLE_MESSAGE} />
      </TenantShell>
    );
  }
  const slug = page.context.slug;
  const loaded = await loadDashboard(page);
  return (
    <TenantShell
      title="Central de Operações"
      currentOrg={page.context}
      organizations={page.organizations}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Central de operações</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Dados reais da organização: campanhas, tentativas e custos registrados.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-9 gap-2 text-xs">
              <Link href={`/orgs/${slug}/contacts`}>
                <Upload className="h-3.5 w-3.5" /> Importar contatos
              </Link>
            </Button>
            <Button asChild size="sm" className="h-9 gap-2 text-xs">
              <Link href={`/orgs/${slug}/campaigns`}>
                <Plus className="h-3.5 w-3.5" /> Nova campanha
              </Link>
            </Button>
          </div>
        </div>
        {loaded ? (
          <DashboardContent orgSlug={slug} overview={loaded.overview} attempts={loaded.attempts} />
        ) : (
          <OperationsLoadError message="Não foi possível carregar os dados operacionais." />
        )}
      </div>
    </TenantShell>
  );
}
