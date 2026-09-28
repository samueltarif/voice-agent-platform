import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, FileEdit } from 'lucide-react';
import { Button } from '@voice-agent/ui';
import type { AgentMetadataResponse, AgentVersionMetadataResponse } from '@voice-agent/contracts';
import { AgentStatusBadge, AgentPublishedVersionBadge } from './agent-status-badge.js';
import { formatAgentDate } from './agent-date-formatter.js';
import { AgentHeaderActions } from './agent-header-actions.js';

export interface AgentDetailHeaderProps {
  readonly agent: AgentMetadataResponse;
  readonly currentDraft: AgentVersionMetadataResponse | null;
  readonly orgSlug: string;
  readonly canPublish?: boolean | undefined;
  readonly canArchive?: boolean | undefined;
  readonly onOpenPublish?: (() => void) | undefined;
  readonly onOpenArchive?: (() => void) | undefined;
  readonly onOpenReactivate?: (() => void) | undefined;
}

interface AgentHeaderIdentityProps {
  readonly name: string;
  readonly slug: string;
  readonly status: string;
  readonly draftVersionNumber?: number | undefined;
  readonly showDraftBadge: boolean;
}

function AgentHeaderIdentity({
  name,
  slug,
  status,
  draftVersionNumber,
  showDraftBadge,
}: AgentHeaderIdentityProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
        <Bot className="h-5 w-5" />
      </div>
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{name}</h1>
          <AgentStatusBadge status={status} />
          {showDraftBadge && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <FileEdit className="h-3 w-3" />
              <span>{`Rascunho v${draftVersionNumber}`}</span>
            </span>
          )}
        </div>
        <p className="text-xs font-mono text-muted-foreground mt-0.5">{slug}</p>
      </div>
    </div>
  );
}

export function AgentDetailHeader({
  agent,
  currentDraft,
  orgSlug,
  canPublish = false,
  canArchive = false,
  onOpenPublish,
  onOpenArchive,
  onOpenReactivate,
}: AgentDetailHeaderProps) {
  const isArchived = agent.status === 'ARCHIVED';

  return (
    <div className="space-y-4">
      <div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="gap-2 text-xs -ml-2 mb-2 text-muted-foreground hover:text-foreground"
        >
          <Link href={`/orgs/${orgSlug}/agents`}>
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar para Agentes</span>
          </Link>
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <AgentHeaderIdentity
            name={agent.name}
            slug={agent.slug}
            status={agent.status}
            draftVersionNumber={currentDraft?.versionNumber}
            showDraftBadge={Boolean(currentDraft) && !isArchived}
          />

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span>Publicado:</span>
                <AgentPublishedVersionBadge versionNumber={agent.currentPublishedVersionNumber} />
              </div>
              <span>•</span>
              <span>{`Atualizado: ${formatAgentDate(agent.updatedAt)}`}</span>
            </div>

            <AgentHeaderActions
              isArchived={isArchived}
              canPublish={canPublish}
              canArchive={canArchive}
              hasDraft={Boolean(currentDraft)}
              onOpenPublish={onOpenPublish}
              onOpenArchive={onOpenArchive}
              onOpenReactivate={onOpenReactivate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
