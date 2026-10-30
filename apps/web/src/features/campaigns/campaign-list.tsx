import * as React from 'react';
import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import { Card, CardContent } from '@voice-agent/ui';
import type { OutboundCampaignResponse } from '@voice-agent/contracts';
import { CampaignStatusBadge } from './campaign-status-badge';
import { formatAgentDate } from '../agents/agent-date-formatter';

interface CampaignListProps {
  readonly campaigns: readonly OutboundCampaignResponse[];
  readonly orgSlug: string;
}

export function CampaignList({ campaigns, orgSlug }: CampaignListProps) {
  if (campaigns.length === 0) {
    return (
      <Card className="border-border/60 shadow-xs" data-testid="campaign-list-empty">
        <CardContent className="flex flex-col items-center py-14 text-center">
          <Megaphone className="mb-3 h-6 w-6 text-primary" aria-hidden />
          <h3 className="text-base font-semibold">Nenhuma campanha ainda</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Campanhas reúnem um agente publicado e uma lista de contatos elegíveis.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border/70 bg-card" role="list">
      {campaigns.map((c) => (
        <li
          key={c.id}
          data-testid={`campaign-row-${c.id}`}
          className="flex items-center justify-between gap-3 p-4"
        >
          <div className="min-w-0 space-y-0.5">
            <Link
              href={`/orgs/${orgSlug}/campaigns/${c.id}`}
              className="block truncate text-sm font-semibold hover:text-primary hover:underline"
            >
              {c.name}
            </Link>
            <span className="text-xs text-muted-foreground">
              Criada em {formatAgentDate(c.createdAt)}
            </span>
          </div>
          <CampaignStatusBadge status={c.status} />
        </li>
      ))}
    </ul>
  );
}
