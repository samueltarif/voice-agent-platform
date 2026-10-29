import * as React from 'react';
import { Badge } from '@voice-agent/ui';
import type { OutboundCampaignStatus } from '@voice-agent/contracts';
import { CAMPAIGN_STATUS_LABELS } from './campaign-labels';

const TONE: Readonly<Record<OutboundCampaignStatus, string>> = {
  DRAFT: 'text-muted-foreground border-dashed',
  ACTIVE: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  PAUSED: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  COMPLETED: 'border-primary/30 text-primary',
  CANCELED: 'text-muted-foreground',
};

export function CampaignStatusBadge({ status }: { readonly status: OutboundCampaignStatus }) {
  return (
    <Badge variant="outline" className={`text-xs font-medium ${TONE[status]}`}>
      {CAMPAIGN_STATUS_LABELS[status]}
    </Badge>
  );
}
