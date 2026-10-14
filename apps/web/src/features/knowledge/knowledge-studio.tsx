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

export function KnowledgeStudio({ role }: { readonly role: TenantRole | string }) {
  const canRead = canReadKnowledge(role);
  const canIngest = canIngestKnowledge(role);
  const canArchive = canArchiveKnowledge(role);
  const list = useKnowledgeListQuery(canRead);
  const mutations = useKnowledgeMutations(list.reload, list.currentQuery);

  if (!canRead) return <KnowledgeErrorState kind="no-permission" />;

  return (
    <div className="space-y-6">
      <KnowledgeStudioHeader canIngest={canIngest} onAdd={() => mutations.setIngestOpen(true)} />

      <div aria-live="polite" className="sr-only">
        {mutations.toast}
      </div>
      {mutations.toast && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
          {mutations.toast}
        </p>
      )}

      {list.loadError ? (
        <KnowledgeErrorState kind={list.loadError} onRetry={() => void list.reload()} />
      ) : (
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
        />
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
          errorStatus={mutations.archiveError}
          onOpenChange={(o) => {
            if (!o) mutations.setTarget(null);
          }}
          onConfirm={() => void mutations.handleArchive()}
        />
      )}
    </div>
  );
}
