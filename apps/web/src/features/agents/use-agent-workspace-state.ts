'use client';

import * as React from 'react';
import type {
  AgentVersionMetadataResponse,
  AgentConfigurationSnapshotV1,
} from '@voice-agent/contracts';

interface UseAgentWorkspaceStateProps {
  readonly agentId: string;
  readonly versions: readonly AgentVersionMetadataResponse[];
  readonly draftVersion: AgentVersionMetadataResponse | null;
  readonly draftConfig: AgentConfigurationSnapshotV1 | null;
  readonly publishedConfig: AgentConfigurationSnapshotV1 | null;
  readonly canReadConfig: boolean;
}

function resolveInitialVersionId(
  draft: AgentVersionMetadataResponse | null,
  versions: readonly AgentVersionMetadataResponse[],
): string | null {
  if (draft) return draft.id;
  const published = versions.find((v) => v.status === 'PUBLISHED');
  return published?.id ?? versions[0]?.id ?? null;
}

interface InitialCacheInput {
  readonly draft: AgentVersionMetadataResponse | null;
  readonly draftCfg: AgentConfigurationSnapshotV1 | null;
  readonly versions: readonly AgentVersionMetadataResponse[];
  readonly pubCfg: AgentConfigurationSnapshotV1 | null;
}

function buildInitialConfigCache(
  input: InitialCacheInput,
): Record<string, AgentConfigurationSnapshotV1> {
  const init: Record<string, AgentConfigurationSnapshotV1> = {};
  if (input.draft && input.draftCfg) init[input.draft.id] = input.draftCfg;
  const published = input.versions.find((v) => v.status === 'PUBLISHED');
  if (published && input.pubCfg) init[published.id] = input.pubCfg;
  return init;
}

export function useAgentWorkspaceState({
  agentId,
  versions,
  draftVersion,
  draftConfig,
  publishedConfig,
  canReadConfig,
}: UseAgentWorkspaceStateProps) {
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(() =>
    resolveInitialVersionId(draftVersion, versions),
  );
  const [configCache, setConfigCache] = React.useState(() =>
    buildInitialConfigCache({
      draft: draftVersion,
      draftCfg: draftConfig,
      versions,
      pubCfg: publishedConfig,
    }),
  );

  const [isLoadingConfig, setIsLoadingConfig] = React.useState(false);

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? null;
  const currentConfig: AgentConfigurationSnapshotV1 | null = selectedVersionId
    ? (configCache[selectedVersionId] ?? null)
    : null;

  const handleSelectVersion = async (versionId: string) => {
    setSelectedVersionId(versionId);
    if (!canReadConfig || configCache[versionId]) return;
    setIsLoadingConfig(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/versions/${versionId}/configuration`);
      if (res.ok) {
        const data = await res.json();
        setConfigCache((prev) => ({ ...prev, [versionId]: data.configuration }));
      }
    } finally {
      setIsLoadingConfig(false);
    }
  };

  return {
    selectedVersionId,
    selectedVersion,
    currentConfig,
    isLoadingConfig,
    handleSelectVersion,
  };
}
