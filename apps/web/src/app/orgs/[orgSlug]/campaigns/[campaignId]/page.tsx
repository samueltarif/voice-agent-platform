import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CampaignProgress, OutboundCampaignResponse } from '@voice-agent/contracts';
import { TenantShell } from '../../../../../shell/tenant-shell';
import { CampaignDetail } from '../../../../../features/campaigns/campaign-detail';
import { OperationsLoadError } from '../../../../../features/operations/operations-load-error';
import {
  isNotFoundError,
  loadOrNull,
  resolveTenantPage,
  type TenantPage,
} from '../../../../../lib/operations/resolve-tenant-page';
import type {
  CampaignAudienceView,
  CampaignDetailView,
  ContactListSummary,
} from '../../../../../lib/operations/operations-types';

interface CampaignPageProps {
  readonly params: Promise<{ orgSlug: string; campaignId: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DetailLoad = { kind: 'OK'; detail: CampaignDetailView } | { kind: 'NOT_FOUND' | 'ERROR' };

async function loadDetail(page: TenantPage, campaignId: string): Promise<DetailLoad> {
  try {
    const [campaign, extra] = await Promise.all([
      page.tenant.request<OutboundCampaignResponse>({
        method: 'GET',
        path: `/v1/campaigns/${campaignId}`,
      }),
      page.tenant.request<{ progress: CampaignProgress; audience: CampaignAudienceView | null }>({
        method: 'GET',
        path: `/v1/campaigns/${campaignId}/progress`,
      }),
    ]);
    return { kind: 'OK', detail: { campaign, ...extra } };
  } catch (error) {
    return { kind: isNotFoundError(error) ? 'NOT_FOUND' : 'ERROR' };
  }
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { orgSlug, campaignId } = await params;
  const page = await resolveTenantPage(orgSlug, `campaigns/${encodeURIComponent(campaignId)}`);
  if (!page) return null;
  if (!UUID.test(campaignId)) notFound();
  const [loaded, lists] = await Promise.all([
    loadDetail(page, campaignId),
    loadOrNull(() =>
      page.tenant.request<ContactListSummary[]>({ method: 'GET', path: '/v1/contact-lists' }),
    ),
  ]);
  if (loaded.kind === 'NOT_FOUND') notFound();
  return (
    <TenantShell title="Campanha" currentOrg={page.context} organizations={page.organizations}>
      <div className="space-y-4">
        <Link
          href={`/orgs/${page.context.slug}/campaigns`}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Campanhas
        </Link>
        {loaded.kind === 'OK' && lists ? (
          <CampaignDetail
            orgSlug={page.context.slug}
            role={page.context.role}
            initial={loaded.detail}
            lists={lists}
          />
        ) : (
          <OperationsLoadError message="Não foi possível carregar a campanha." />
        )}
      </div>
    </TenantShell>
  );
}
