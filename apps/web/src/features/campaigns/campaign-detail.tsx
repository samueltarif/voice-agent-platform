'use client';

import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import type { TenantRole } from '@voice-agent/contracts';
import type { CampaignDetailView, ContactListSummary } from '../../lib/operations/operations-types';
import { OperationFeedback } from '../operations/operation-feedback';
import { CampaignActionsBar } from './campaign-actions-bar';
import { CampaignAudiencePanel } from './campaign-audience-panel';
import { availableCampaignActions } from './campaign-labels';
import { canOperateCampaigns } from './campaign-permissions';
import { CampaignProgressPanel } from './campaign-progress-panel';
import { CampaignStatusBadge } from './campaign-status-badge';
import { useCampaignDetail } from './use-campaign-detail';

interface CampaignDetailProps {
  readonly orgSlug: string;
  readonly role: TenantRole | string;
  readonly initial: CampaignDetailView;
  readonly lists: readonly ContactListSummary[];
}

export function CampaignDetail({ orgSlug, role, initial, lists }: CampaignDetailProps) {
  const { detail, pending, feedback, assignAudience, applyAction } = useCampaignDetail(
    orgSlug,
    initial,
  );
  const { campaign } = detail;
  const editableAudience = campaign.status === 'DRAFT' && canOperateCampaigns(role);
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight" data-testid="campaign-name">
              {campaign.name}
            </h2>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          {campaign.description && (
            <p className="text-sm text-muted-foreground">{campaign.description}</p>
          )}
        </div>
        <CampaignActionsBar
          actions={availableCampaignActions(campaign.status, role)}
          pending={pending}
          onAction={(action) => void applyAction(action)}
        />
      </div>
      <OperationFeedback state={feedback} testId="campaign-feedback" />
      <p
        data-testid="campaign-offline-notice"
        className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground"
      >
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        Discagem real desativada neste ambiente: iniciar a campanha apenas agenda os contatos
        elegíveis.
      </p>
      <CampaignAudiencePanel
        orgSlug={orgSlug}
        audience={detail.audience}
        lists={lists}
        editable={editableAudience}
        pending={pending}
        onAssign={(id) => void assignAudience(id)}
      />
      <CampaignProgressPanel progress={detail.progress} />
    </div>
  );
}
