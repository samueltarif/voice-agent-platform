import * as React from 'react';
import type {
  AgentVersionMetadataResponse,
  AgentConfigurationSnapshotV1,
} from '@voice-agent/contracts';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AgentDraftBanner } from './agent-draft-banner.js';
import { AgentDraftEditor } from './agent-draft-editor.js';
import { AgentReadOnlyBanner } from './agent-read-only-banner.js';

export interface AgentWorkspaceContentProps {
  readonly agentId: string;
  readonly isArchivedAgent: boolean;
  readonly hasDraft: boolean;
  readonly canReadConfig: boolean;
  readonly canEdit: boolean;
  readonly isLoadingConfig: boolean;
  readonly selectedVersion: AgentVersionMetadataResponse | null;
  readonly currentConfig: AgentConfigurationSnapshotV1 | null;
}

function useDraftCreation(agentId: string) {
  const router = useRouter();
  const [isCreatingDraft, setIsCreatingDraft] = React.useState(false);

  const handleCreateDraft = async () => {
    setIsCreatingDraft(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setIsCreatingDraft(false);
    }
  };

  return { isCreatingDraft, handleCreateDraft };
}

function ConfigLoadingIndicator() {
  return (
    <div className="p-12 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      <span>Carregando configuração...</span>
    </div>
  );
}

interface ReadOnlyWorkspaceProps {
  readonly agentId: string;
  readonly selectedVersion: AgentVersionMetadataResponse;
  readonly currentConfig: AgentConfigurationSnapshotV1;
  readonly isArchivedAgent: boolean;
  readonly hasDraft: boolean;
  readonly canEdit: boolean;
  readonly isCreatingDraft: boolean;
  readonly onCreateDraft: () => void;
}

function ReadOnlyWorkspaceView({
  agentId,
  selectedVersion,
  currentConfig,
  isArchivedAgent,
  hasDraft,
  canEdit,
  isCreatingDraft,
  onCreateDraft,
}: ReadOnlyWorkspaceProps) {
  return (
    <div className="space-y-4">
      <AgentReadOnlyBanner
        versionNumber={selectedVersion.versionNumber}
        status={selectedVersion.status}
        isAgentArchived={isArchivedAgent}
        canCreateDraft={!hasDraft && canEdit && !isArchivedAgent}
        isCreatingDraft={isCreatingDraft}
        onCreateDraft={onCreateDraft}
      />
      <AgentDraftEditor
        agentId={agentId}
        versionId={selectedVersion.id}
        initialConfiguration={currentConfig}
        readOnly={true}
      />
    </div>
  );
}

export function AgentWorkspaceContent({
  agentId,
  isArchivedAgent,
  hasDraft,
  canReadConfig,
  canEdit,
  isLoadingConfig,
  selectedVersion,
  currentConfig,
}: AgentWorkspaceContentProps) {
  const { isCreatingDraft, handleCreateDraft } = useDraftCreation(agentId);

  if (!canReadConfig) {
    return (
      <AgentDraftBanner
        agentId={agentId}
        hasDraft={hasDraft}
        canReadConfig={false}
        canEdit={false}
      />
    );
  }

  if (!selectedVersion || !currentConfig) {
    if (isLoadingConfig) {
      return <ConfigLoadingIndicator />;
    }
    return (
      <AgentDraftBanner
        agentId={agentId}
        hasDraft={hasDraft}
        canReadConfig={canReadConfig}
        canEdit={canEdit && !isArchivedAgent}
      />
    );
  }

  if (selectedVersion.status === 'DRAFT' && !isArchivedAgent) {
    return (
      <AgentDraftEditor
        agentId={agentId}
        versionId={selectedVersion.id}
        initialConfiguration={currentConfig}
        readOnly={!canEdit}
      />
    );
  }

  return (
    <ReadOnlyWorkspaceView
      agentId={agentId}
      selectedVersion={selectedVersion}
      currentConfig={currentConfig}
      isArchivedAgent={isArchivedAgent}
      hasDraft={hasDraft}
      canEdit={canEdit}
      isCreatingDraft={isCreatingDraft}
      onCreateDraft={handleCreateDraft}
    />
  );
}
