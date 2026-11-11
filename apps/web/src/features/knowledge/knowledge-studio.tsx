'use client';

import * as React from 'react';
import type { TenantRole } from '@voice-agent/contracts';
import { canArchiveKnowledge, canIngestKnowledge, canReadKnowledge } from './knowledge-permissions';
import { useKnowledgeListQuery } from './use-knowledge-list';
import { useKnowledgeMutations } from './use-knowledge-mutations';
import { KnowledgeStudioHeader } from './knowledge-studio-header';
import { KnowledgeDocumentList } from './knowledge-document-list';
import { KnowledgeIngestForm } from './knowledge-ingest-form';
import { KnowledgeArchiveDialog } from './knowledge-archive-dialog';
import { KnowledgeErrorState } from './knowledge-error-state';
import type { KnowledgeFailure } from './knowledge-failure';
import { handleDialogCloseAutoFocus, useListFocusTarget } from './knowledge-list-focus';
import { knowledgeManagePermissions } from './knowledge-document-actions';
import { useKnowledgeManagement } from './use-knowledge-management';
import { KnowledgeManagementDialogs } from './knowledge-management-dialogs';
import type { KnowledgeManageProps } from './knowledge-row-actions-menu';

/** A mensagem mais recente entre cadastro/arquivamento e gestão. */
function useLatestToast(fromMutations: string | null, fromManagement: string | null) {
  const [latest, setLatest] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (fromMutations) setLatest(fromMutations);
  }, [fromMutations]);
  React.useEffect(() => {
    if (fromManagement) setLatest(fromManagement);
  }, [fromManagement]);
  return latest;
}

function KnowledgeToast({ toast }: { readonly toast: string | null }) {
  return (
    <>
      <div aria-live="polite" className="sr-only">
        {toast}
      </div>
      {toast && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
          {toast}
        </p>
      )}
    </>
  );
}

function archiveErrorProps(error: KnowledgeFailure | undefined) {
  return { errorStatus: error?.status, errorCode: error?.code };
}

export function KnowledgeStudio({
  orgSlug,
  role,
}: {
  readonly orgSlug: string;
  readonly role: TenantRole | string;
}) {
  const canRead = canReadKnowledge(role);
  const canIngest = canIngestKnowledge(role);
  const canArchive = canArchiveKnowledge(role);
  const list = useKnowledgeListQuery(orgSlug, canRead);
  const focusTarget = useListFocusTarget();
  const mutations = useKnowledgeMutations(orgSlug, list.reload, list.currentQuery);
  const management = useKnowledgeManagement({
    orgSlug,
    enabled: canRead,
    reload: list.reload,
    currentQuery: list.currentQuery,
  });
  const toast = useLatestToast(mutations.toast, management.toast);
  const manage: KnowledgeManageProps = {
    permissions: knowledgeManagePermissions(role),
    agentNames: management.agentNames,
    onAction: (action, doc) =>
      action === 'archive' ? mutations.openArchiveTarget(doc) : management.open(action, doc),
  };

  if (!canRead) return <KnowledgeErrorState kind="no-permission" />;

  return (
    <div className="space-y-6">
      <KnowledgeStudioHeader canIngest={canIngest} onAdd={() => mutations.setIngestOpen(true)} />

      <KnowledgeToast toast={toast} />

      {list.loadError ? (
        <KnowledgeErrorState kind={list.loadError} onRetry={() => void list.reload()} />
      ) : (
        <div ref={focusTarget.ref} tabIndex={-1} className="outline-none">
          <KnowledgeDocumentList
            documents={list.documents}
            isLoading={list.isLoading}
            filters={list.filters}
            offset={list.offset}
            canIngest={canIngest}
            canArchive={canArchive}
            onFiltersChange={list.setFilters}
            onPageChange={list.setOffset}
            onAdd={() => mutations.setIngestOpen(true)}
            onArchive={(d) => mutations.openArchiveTarget(d)}
            manage={manage}
          />
        </div>
      )}

      {canIngest && (
        <KnowledgeIngestForm
          isOpen={mutations.ingestOpen}
          onOpenChange={mutations.setIngestOpen}
          onSubmit={mutations.handleIngest}
        />
      )}
      {canArchive && (
        <KnowledgeArchiveDialog
          isOpen={mutations.target !== null}
          documentTitle={mutations.target?.title ?? ''}
          isPending={mutations.archiving}
          {...archiveErrorProps(mutations.archiveError)}
          onOpenChange={(o) => {
            if (!o) mutations.setTarget(null);
          }}
          onCloseAutoFocus={(e) => handleDialogCloseAutoFocus(e, focusTarget.restoreFocus)}
          onConfirm={() => void mutations.handleArchive()}
        />
      )}
      <KnowledgeManagementDialogs management={management} />
    </div>
  );
}
