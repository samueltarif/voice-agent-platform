import * as React from 'react';
import { redirect } from 'next/navigation';
import { Info } from 'lucide-react';
import type { OperationsAttemptRow } from '@voice-agent/contracts';
import { TenantShell } from '../../shell/tenant-shell';
import { AttemptsTable } from '../../features/campaign-reports/campaign-attempts-table';
import { ATTEMPTS_PAGE_SIZE } from '../../features/campaign-reports/report-labels';
import { OperationsLoadError } from '../../features/operations/operations-load-error';
import { NoOrganizationState } from '../../features/operations-overview/no-organization-state';
import {
  CONTEXT_UNAVAILABLE_MESSAGE,
  resolveOverviewContext,
} from '../../features/operations-overview/load-tenant-overview';

const PERIOD_DAYS = 30;
const PERIOD = { days: String(PERIOD_DAYS) } as const;

/** 008-MVP4c: tentativas reais da organização (sem transcrições/gravações simuladas). */
export default async function CallsPage() {
  const page = await resolveOverviewContext();
  if (page.kind === 'UNAUTHENTICATED') {
    redirect('/login');
    return null;
  }
  if (page.kind === 'NO_ORGANIZATION') {
    return (
      <TenantShell title="Chamadas">
        <NoOrganizationState />
      </TenantShell>
    );
  }
  if (page.kind === 'CONTEXT_UNAVAILABLE') {
    return (
      <TenantShell title="Chamadas">
        <OperationsLoadError message={CONTEXT_UNAVAILABLE_MESSAGE} />
      </TenantShell>
    );
  }
  const attempts = await page.tenant
    .request<OperationsAttemptRow[]>({
      method: 'GET',
      path: `/v1/operations/attempts?days=${PERIOD_DAYS}&limit=${ATTEMPTS_PAGE_SIZE + 1}`,
    })
    .catch(() => null);
  return (
    <TenantShell title="Chamadas" currentOrg={page.context} organizations={page.organizations}>
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Chamadas e tentativas</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Tentativas de discagem dos últimos {PERIOD_DAYS} dias, de todas as campanhas.
          </p>
        </div>
        <p
          className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground"
          data-testid="calls-availability-notice"
        >
          <Info className="h-4 w-4 shrink-0" aria-hidden />
          Discagem real desativada neste ambiente. Transcrições, gravações e desfechos da conversa
          ainda não são armazenados, então não são exibidos.
        </p>
        {attempts ? (
          <AttemptsTable
            orgSlug={page.context.slug}
            endpoint="/api/operations/attempts"
            fixedParams={PERIOD}
            initial={attempts}
            title="Tentativas"
          />
        ) : (
          <OperationsLoadError message="Não foi possível carregar as tentativas." />
        )}
      </div>
    </TenantShell>
  );
}
