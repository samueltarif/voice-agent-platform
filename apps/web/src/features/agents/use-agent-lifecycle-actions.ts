'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

interface UseAgentLifecycleActionsProps {
  readonly agentId: string;
  readonly draftVersionId: string | null;
}

function useAgentPublishAction(agentId: string, draftVersionId: string | null) {
  const router = useRouter();
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [publishError, setPublishError] = React.useState<string | null>(null);

  const handleConfirmPublish = async () => {
    if (!draftVersionId) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/draft/publish?versionId=${draftVersionId}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setPublishError(err?.error ?? 'Falha ao publicar versão.');
        setIsPublishing(false);
        return;
      }
      setIsPublishing(false);
      setPublishOpen(false);
      router.refresh();
    } catch {
      setPublishError('Erro de conexão ao publicar versão.');
      setIsPublishing(false);
    }
  };

  return { publishOpen, setPublishOpen, isPublishing, handleConfirmPublish, publishError };
}

function resolveArchiveEndpoint(agentId: string, mode: 'archive' | 'reactivate'): string {
  return mode === 'archive'
    ? `/api/agents/${agentId}/archive`
    : `/api/agents/${agentId}/reactivate`;
}

function useAgentArchiveAction(agentId: string) {
  const router = useRouter();
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [archiveMode, setArchiveMode] = React.useState<'archive' | 'reactivate'>('archive');
  const [isPendingArchive, setIsPendingArchive] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);

  const handleConfirmArchive = async () => {
    setIsPendingArchive(true);
    setArchiveError(null);
    const endpoint = resolveArchiveEndpoint(agentId, archiveMode);

    try {
      const res = await fetch(endpoint, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setArchiveError(
          err?.error ?? `Falha ao ${archiveMode === 'archive' ? 'arquivar' : 'reativar'} agente.`,
        );
        setIsPendingArchive(false);
        return;
      }
      setIsPendingArchive(false);
      setArchiveOpen(false);
      router.refresh();
    } catch {
      setArchiveError(
        `Erro de conexão ao ${archiveMode === 'archive' ? 'arquivar' : 'reativar'} agente.`,
      );
      setIsPendingArchive(false);
    }
  };

  return {
    archiveOpen,
    setArchiveOpen,
    archiveMode,
    isPendingArchive,
    handleConfirmArchive,
    archiveError,
    openArchive: () => {
      setArchiveMode('archive');
      setArchiveError(null);
      setArchiveOpen(true);
    },
    openReactivate: () => {
      setArchiveMode('reactivate');
      setArchiveError(null);
      setArchiveOpen(true);
    },
  };
}

export function useAgentLifecycleActions({
  agentId,
  draftVersionId,
}: UseAgentLifecycleActionsProps) {
  const pub = useAgentPublishAction(agentId, draftVersionId);
  const arch = useAgentArchiveAction(agentId);

  return {
    publishOpen: pub.publishOpen,
    setPublishOpen: pub.setPublishOpen,
    isPublishing: pub.isPublishing,
    handleConfirmPublish: pub.handleConfirmPublish,
    archiveOpen: arch.archiveOpen,
    setArchiveOpen: arch.setArchiveOpen,
    archiveMode: arch.archiveMode,
    isPendingArchive: arch.isPendingArchive,
    handleConfirmArchive: arch.handleConfirmArchive,
    actionError: pub.publishError ?? arch.archiveError,
    openArchive: arch.openArchive,
    openReactivate: arch.openReactivate,
  };
}
