import * as React from 'react';
import { notFound } from 'next/navigation';
import type {
  CampaignAttemptRow,
  CampaignReport,
  OutboundCampaignResponse,
} from '@voice-agent/contracts';
import { TenantShell } from '../../../../../../shell/tenant-shell';
import { CampaignReportView } from '../../../../../../features/campaign-reports/campaign-report-view';
import { ATTEMPTS_PAGE_SIZE } from '../../../../../../features/campaign-reports/report-labels';
import { OperationsLoadError } from '../../../../../../features/operations/operations-load-error';
import {
  isNotFoundError,
  resolveTenantPage,
  type TenantPage,
} from '../../../../../../lib/operations/resolve-tenant-page';

interface CampaignReportPageProps {
  readonly params: Promise<{ orgSlug: string; campaignId: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReportLoad =
  | {
      kind: 'OK';
      campaign: OutboundCampaignResponse;
      report: CampaignReport;
      attempts: CampaignAttemptRow[];
    }
  | { kind: 'NOT_FOUND' | 'ERROR' };

async function loadReport(page: TenantPage, campaignId: string): Promise<ReportLoad> {
  try {
    const [campaign, report, attempts] = await Promise.all([
      page.tenant.request<OutboundCampaignResponse>({
        method: 'GET',
        path: `/v1/campaigns/${campaignId}`,
      }),
      page.tenant.request<CampaignReport>({
        method: 'GET',
        path: `/v1/campaigns/${campaignId}/report`,
      }),
      page.tenant.request<CampaignAttemptRow[]>({
        method: 'GET',
        path: `/v1/campaigns/${campaignId}/attempts?limit=${ATTEMPTS_PAGE_SIZE + 1}`,
      }),
    ]);
    return { kind: 'OK', campaign, report, attempts };
  } catch (error) {
    return { kind: isNotFoundError(error) ? 'NOT_FOUND' : 'ERROR' };
  }
}

export default async function CampaignReportPage({ params }: CampaignReportPageProps) {
  const { orgSlug, campaignId } = await params;
  const page = await resolveTenantPage(
    orgSlug,
    `campaigns/${encodeURIComponent(campaignId)}/report`,
  );
  if (!page) return null;
  if (!UUID.test(campaignId)) notFound();
  const loaded = await loadReport(page, campaignId);
  if (loaded.kind === 'NOT_FOUND') notFound();
  return (
    <TenantShell title="Relatório" currentOrg={page.context} organizations={page.organizations}>
      {loaded.kind === 'OK' ? (
        <CampaignReportView
          orgSlug={page.context.slug}
          campaignName={loaded.campaign.name}
          report={loaded.report}
          attempts={loaded.attempts}
        />
      ) : (
        <OperationsLoadError message="Não foi possível carregar o relatório." />
      )}
    </TenantShell>
  );
}
