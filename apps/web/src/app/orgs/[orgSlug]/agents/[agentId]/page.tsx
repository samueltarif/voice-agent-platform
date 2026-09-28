import * as React from 'react';
import { redirect } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@voice-agent/ui';
import type {
  AgentMetadataResponse,
  AgentVersionMetadataResponse,
  AgentConfigurationSnapshotV1,
} from '@voice-agent/contracts';
import { getServerOrganizationContext } from '../../../../../lib/organization/server-organization-context.js';
import { TenantShell } from '../../../../../shell/tenant-shell';
import {
  canReadAgentConfig,
  canEditAgent,
} from '../../../../../features/agents/agent-permissions.js';
import { AgentDetailHeader } from '../../../../../features/agents/agent-detail-header';
import { AgentDraftBanner } from '../../../../../features/agents/agent-draft-banner';
import { AgentDraftEditor } from '../../../../../features/agents/agent-draft-editor';
import { loadAgentDetailData } from './load-agent-detail-data.js';

interface AgentDetailPageProps {
  readonly params: Promise<{ orgSlug: string; agentId: string }>;
}

function AgentDetailStatusNotice({
  isNotFound,
  errorMessage,
}: {
  readonly isNotFound: boolean;
  readonly errorMessage: string | null;
}) {
  if (isNotFound) {
    return (
      <Card className="border-border/60">
        <CardContent className="py-12 text-center space-y-2">
          <h3 className="text-base font-semibold text-foreground">Agente não encontrado</h3>
          <p className="text-xs text-muted-foreground">
            O agente solicitado não existe ou pertence a outra organização.
          </p>
        </CardContent>
      </Card>
    );
  }
  if (errorMessage) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex items-center gap-3 py-6 px-4 text-destructive text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{errorMessage}</span>
        </CardContent>
      </Card>
    );
  }
  return null;
}

function AgentDetailBody({
  agent,
  draftVersion,
  draftConfig,
  canReadConfig,
  canEdit,
}: {
  readonly agent: AgentMetadataResponse;
  readonly draftVersion: AgentVersionMetadataResponse | null;
  readonly draftConfig: AgentConfigurationSnapshotV1 | null;
  readonly canReadConfig: boolean;
  readonly canEdit: boolean;
}) {
  if (!canReadConfig || !draftVersion || !draftConfig) {
    return (
      <AgentDraftBanner
        agentId={agent.id}
        hasDraft={Boolean(draftVersion)}
        canReadConfig={canReadConfig}
        canEdit={canEdit}
      />
    );
  }

  return (
    <AgentDraftEditor
      agentId={agent.id}
      versionId={draftVersion.id}
      initialConfiguration={draftConfig}
      readOnly={!canEdit}
    />
  );
}

async function resolveVerifiedOrgContext(orgSlug: string, agentId: string) {
  const orgResult = await getServerOrganizationContext();
  if (orgResult.status === 'UNAUTHENTICATED') {
    redirect('/login');
    return null;
  }
  if (orgResult.status !== 'RESOLVED' || !orgResult.context || !orgResult.user) {
    redirect('/dashboard');
    return null;
  }
  if (orgSlug !== orgResult.context.slug) {
    redirect(`/orgs/${orgResult.context.slug}/agents/${agentId}`);
    return null;
  }
  return { activeOrg: orgResult.context, user: orgResult.user, orgResult };
}

export default async function AgentDetailPage({ params }: AgentDetailPageProps) {
  const { orgSlug, agentId } = await params;
  const verified = await resolveVerifiedOrgContext(orgSlug, agentId);
  if (!verified) {
    return null;
  }
  const { activeOrg, user, orgResult } = verified;

  const canReadConfig = canReadAgentConfig(activeOrg.role);
  const canEdit = canEditAgent(activeOrg.role);
  const { agent, draftVersion, draftConfig, isNotFound, errorMessage } = await loadAgentDetailData(
    activeOrg,
    user.id,
    agentId,
  );

  const pageTitle = agent ? `${agent.name} — Detalhes` : 'Agente — Detalhes';

  return (
    <TenantShell
      title={pageTitle}
      currentOrg={activeOrg}
      organizations={orgResult.availableOrganizations}
    >
      <div className="space-y-6">
        <AgentDetailStatusNotice isNotFound={isNotFound} errorMessage={errorMessage} />

        {agent && (
          <>
            <AgentDetailHeader agent={agent} currentDraft={draftVersion} orgSlug={activeOrg.slug} />
            <AgentDetailBody
              agent={agent}
              draftVersion={draftVersion}
              draftConfig={draftConfig}
              canReadConfig={canReadConfig}
              canEdit={canEdit}
            />
          </>
        )}
      </div>
    </TenantShell>
  );
}
