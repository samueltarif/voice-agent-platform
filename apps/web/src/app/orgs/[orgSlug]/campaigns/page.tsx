import * as React from 'react';
import type { AgentMetadataResponse, OutboundCampaignResponse } from '@voice-agent/contracts';
import { TenantShell } from '../../../../shell/tenant-shell';
import { CampaignCreateForm } from '../../../../features/campaigns/campaign-create-form';
import { CampaignList } from '../../../../features/campaigns/campaign-list';
import { canOperateCampaigns } from '../../../../features/campaigns/campaign-permissions';
import { OperationsLoadError } from '../../../../features/operations/operations-load-error';
import {
  loadOrNull,
  resolveTenantPage,
  type TenantPage,
} from '../../../../lib/operations/resolve-tenant-page';

interface CampaignsPageProps {
  readonly params: Promise<{ orgSlug: string }>;
}

/** Só agentes ATIVOS com versão publicada podem originar campanhas. */
async function loadCampaignAgents(page: TenantPage) {
  const agents = await loadOrNull(() =>
    page.tenant.request<AgentMetadataResponse[]>({ method: 'GET', path: '/v1/agents' }),
  );
  return (agents ?? [])
    .filter((a) => a.status === 'ACTIVE' && a.currentPublishedVersionNumber !== null)
    .map((a) => ({ id: a.id, name: a.name }));
}

export default async function CampaignsPage({ params }: CampaignsPageProps) {
  const { orgSlug } = await params;
  const page = await resolveTenantPage(orgSlug, 'campaigns');
  if (!page) return null;
  const canOperate = canOperateCampaigns(page.context.role);
  const [campaigns, agents] = await Promise.all([
    loadOrNull(() =>
      page.tenant.request<OutboundCampaignResponse[]>({
        method: 'GET',
        path: '/v1/campaigns?limit=100',
      }),
    ),
    canOperate ? loadCampaignAgents(page) : Promise.resolve([]),
  ]);
  return (
    <TenantShell title="Campanhas" currentOrg={page.context} organizations={page.organizations}>
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Campanhas</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Campanhas outbound com contatos elegíveis da organização.
          </p>
        </div>
        {canOperate && <CampaignCreateForm orgSlug={page.context.slug} agents={agents} />}
        {campaigns ? (
          <CampaignList campaigns={campaigns} orgSlug={page.context.slug} />
        ) : (
          <OperationsLoadError message="Não foi possível carregar as campanhas." />
        )}
      </div>
    </TenantShell>
  );
}
