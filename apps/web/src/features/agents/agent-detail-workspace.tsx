'use client';

import * as React from 'react';
import type {
  AgentMetadataResponse,
  AgentVersionMetadataResponse,
  AgentConfigurationSnapshotV1,
} from '@voice-agent/contracts';
import { AlertCircle } from 'lucide-react';
import { AgentDetailHeader } from './agent-detail-header.js';
import { AgentVersionHistory } from './agent-version-history.js';
import { AgentPublishDialog } from './agent-publish-dialog.js';
import { AgentArchiveDialog } from './agent-archive-dialog.js';
import { AgentWorkspaceContent } from './agent-workspace-content.js';
import { useAgentLifecycleActions } from './use-agent-lifecycle-actions.js';
import { useAgentWorkspaceState } from './use-agent-workspace-state.js';

export interface AgentDetailWorkspaceProps {
  readonly agent: AgentMetadataResponse;
  readonly versions: readonly AgentVersionMetadataResponse[];
  readonly draftVersion: AgentVersionMetadataResponse | null;
  readonly draftConfig: AgentConfigurationSnapshotV1 | null;
  readonly publishedConfig: AgentConfigurationSnapshotV1 | null;
  readonly canReadConfig: boolean;
  readonly canEdit: boolean;
  readonly canPublish: boolean;
  readonly canArchive: boolean;
  readonly orgSlug: string;
}

interface WorkspaceDialogsProps {
  readonly draftVersion: AgentVersionMetadataResponse | null;
  readonly agentName: string;
  readonly actions: ReturnType<typeof useAgentLifecycleActions>;
}

function WorkspaceDialogs({ draftVersion, agentName, actions }: WorkspaceDialogsProps) {
  return (
    <>
      {draftVersion && (
        <AgentPublishDialog
          isOpen={actions.publishOpen}
          onOpenChange={actions.setPublishOpen}
          versionNumber={draftVersion.versionNumber}
          isPublishing={actions.isPublishing}
          onConfirmPublish={actions.handleConfirmPublish}
        />
      )}
      <AgentArchiveDialog
        isOpen={actions.archiveOpen}
        onOpenChange={actions.setArchiveOpen}
        mode={actions.archiveMode}
        agentName={agentName}
        isPending={actions.isPendingArchive}
        onConfirm={actions.handleConfirmArchive}
      />
    </>
  );
}

export function AgentDetailWorkspace({
  agent,
  versions,
  draftVersion,
  draftConfig,
  publishedConfig,
  canReadConfig,
  canEdit,
  canPublish,
  canArchive,
  orgSlug,
}: AgentDetailWorkspaceProps) {
  const {
    selectedVersionId,
    selectedVersion,
    currentConfig,
    isLoadingConfig,
    handleSelectVersion,
  } = useAgentWorkspaceState({
    agentId: agent.id,
    versions,
    draftVersion,
    draftConfig,
    publishedConfig,
    canReadConfig,
  });

  const actions = useAgentLifecycleActions({
    agentId: agent.id,
    draftVersionId: draftVersion?.id ?? null,
  });
  const isArchivedAgent = agent.status === 'ARCHIVED';

  return (
    <div className="space-y-6" data-testid="agent-detail-workspace">
      <AgentDetailHeader
        agent={agent}
        currentDraft={draftVersion}
        orgSlug={orgSlug}
        canPublish={canPublish}
        canArchive={canArchive}
        onOpenPublish={() => actions.setPublishOpen(true)}
        onOpenArchive={actions.openArchive}
        onOpenReactivate={actions.openReactivate}
      />

      {actions.actionError && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{actions.actionError}</span>
        </div>
      )}

      <WorkspaceDialogs draftVersion={draftVersion} agentName={agent.name} actions={actions} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <div className="lg:col-span-1">
          <AgentVersionHistory
            versions={versions}
            selectedVersionId={selectedVersionId}
            onSelectVersion={handleSelectVersion}
          />
        </div>

        <div className="lg:col-span-3 space-y-6">
          <AgentWorkspaceContent
            agentId={agent.id}
            isArchivedAgent={isArchivedAgent}
            hasDraft={Boolean(draftVersion)}
            canReadConfig={canReadConfig}
            canEdit={canEdit}
            isLoadingConfig={isLoadingConfig}
            selectedVersion={selectedVersion}
            currentConfig={currentConfig}
          />
        </div>
      </div>
    </div>
  );
}
