import * as React from 'react';
import Link from 'next/link';
import type { CampaignAttemptRow, CampaignReport } from '@voice-agent/contracts';
import { CampaignStatusBadge } from '../campaigns/campaign-status-badge';
import { CampaignAttemptsTable } from './campaign-attempts-table';
import { CampaignReportCosts } from './campaign-report-costs';
import { CampaignReportSummary } from './campaign-report-summary';

interface CampaignReportViewProps {
  readonly orgSlug: string;
  readonly campaignName: string;
  readonly report: CampaignReport;
  readonly attempts: readonly CampaignAttemptRow[];
}

export function CampaignReportView(props: CampaignReportViewProps) {
  const { orgSlug, report } = props;
  return (
    <div className="space-y-5">
      <Link
        href={`/orgs/${orgSlug}/campaigns/${report.campaignId}`}
        className="text-xs text-muted-foreground hover:underline"
      >
        ← Voltar à campanha
      </Link>
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-bold tracking-tight">Relatório · {props.campaignName}</h2>
        <CampaignStatusBadge status={report.campaignStatus} />
      </div>
      <CampaignReportSummary report={report} />
      <CampaignReportCosts costs={report.costs} />
      <CampaignAttemptsTable
        orgSlug={orgSlug}
        campaignId={report.campaignId}
        initial={props.attempts}
      />
    </div>
  );
}
