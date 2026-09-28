'use client';

import * as React from 'react';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';

interface UseAgentDraftEditorStateOptions {
  readonly agentId: string;
  readonly versionId: string;
  readonly initialConfiguration: AgentConfigurationSnapshotV1;
}

interface UseDraftActionsOptions {
  readonly agentId: string;
  readonly versionId: string;
  readonly config: AgentConfigurationSnapshotV1;
  readonly onSaveSuccess: () => void;
}

async function sendDraftSaveRequest(
  agentId: string,
  versionId: string,
  config: AgentConfigurationSnapshotV1,
) {
  const res = await fetch(`/api/agents/${agentId}/draft?versionId=${versionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configuration: config }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || 'Falha ao salvar rascunho');
  }
}

async function sendDraftDiscardRequest(agentId: string, versionId: string) {
  const res = await fetch(`/api/agents/${agentId}/draft?versionId=${versionId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || 'Falha ao descartar rascunho');
  }
}

function useDraftActions({ agentId, versionId, config, onSaveSuccess }: UseDraftActionsOptions) {
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDiscarding, setIsDiscarding] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = React.useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    setSavedSuccess(false);
    try {
      await sendDraftSaveRequest(agentId, versionId, config);
      onSaveSuccess();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro inesperado ao salvar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (!window.confirm('Descartar este rascunho? Todas as alterações serão perdidas.')) return;
    setIsDiscarding(true);
    setErrorMessage(null);
    try {
      await sendDraftDiscardRequest(agentId, versionId);
      window.location.reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro inesperado ao descartar');
      setIsDiscarding(false);
    }
  };

  return { isSaving, isDiscarding, errorMessage, savedSuccess, handleSave, handleDiscard };
}

export function useAgentDraftEditorState({
  agentId,
  versionId,
  initialConfiguration,
}: UseAgentDraftEditorStateOptions) {
  const [config, setConfig] = React.useState<AgentConfigurationSnapshotV1>(initialConfiguration);
  const [lastSaved, setLastSaved] =
    React.useState<AgentConfigurationSnapshotV1>(initialConfiguration);

  const isDirty = React.useMemo(
    () => JSON.stringify(config) !== JSON.stringify(lastSaved),
    [config, lastSaved],
  );

  const actions = useDraftActions({
    agentId,
    versionId,
    config,
    onSaveSuccess: () => setLastSaved(config),
  });

  return {
    config,
    setConfig,
    isDirty,
    ...actions,
  };
}
