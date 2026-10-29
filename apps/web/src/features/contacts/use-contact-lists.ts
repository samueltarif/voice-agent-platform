'use client';

import * as React from 'react';
import { operationsRequest } from '../../lib/operations/operations-client';
import type {
  ContactImportReport,
  ContactListMember,
  ContactListSummary,
} from '../../lib/operations/operations-types';
import { useOperation } from '../operations/use-operation';

export type MemberEligibility = 'ELIGIBLE' | 'ALL';

export interface ImportCsvInput {
  readonly csv: string;
  readonly phoneColumn: string;
  readonly nameColumn?: string | undefined;
}

function importSummary(r: ContactImportReport): string {
  return `${r.addedToList} contatos adicionados à lista (${r.created} novos), ${r.rejected.length} linhas recusadas.`;
}

/** Membros da lista selecionada (elegíveis por padrão); `null` = falha de leitura. */
function useListMembers(orgSlug: string, listId: string) {
  const [eligibility, setEligibility] = React.useState<MemberEligibility>('ELIGIBLE');
  const [members, setMembers] = React.useState<readonly ContactListMember[] | null>(null);

  const loadMembers = React.useCallback(async () => {
    if (!listId) return setMembers([]);
    try {
      const path = `/api/contact-lists/${listId}/members?eligibility=${eligibility}&limit=100`;
      const res = await operationsRequest<{ members: ContactListMember[] }>(orgSlug, path);
      setMembers(res.members);
    } catch {
      setMembers(null);
    }
  }, [orgSlug, listId, eligibility]);

  React.useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  return { eligibility, setEligibility, members, loadMembers };
}

function postImport(orgSlug: string, listId: string, input: ImportCsvInput) {
  const mapping = {
    phoneColumn: input.phoneColumn,
    ...(input.nameColumn ? { nameColumn: input.nameColumn } : {}),
  };
  return operationsRequest<ContactImportReport>(orgSlug, `/api/contact-lists/${listId}/imports`, {
    method: 'POST',
    body: { csv: input.csv, mapping },
  });
}

function postList(orgSlug: string, name: string) {
  return operationsRequest<ContactListSummary>(orgSlug, '/api/contact-lists', {
    method: 'POST',
    body: { name },
  });
}

/** Listas, membros e importação; toda mutação relê o estado real. */
export function useContactLists(orgSlug: string, initialLists: readonly ContactListSummary[]) {
  const [lists, setLists] = React.useState(initialLists);
  const [selectedId, setSelectedId] = React.useState(initialLists[0]?.id ?? '');
  const view = useListMembers(orgSlug, selectedId);
  const { loadMembers } = view;
  const [report, setReport] = React.useState<ContactImportReport | null>(null);
  const { run, pending, feedback, setFeedback } = useOperation();
  const rejectLocally = React.useCallback(
    (message: string) => setFeedback({ kind: 'error', message }),
    [setFeedback],
  );

  const createList = React.useCallback(
    async (name: string) => {
      const created = await run(
        () => postList(orgSlug, name),
        (list) => `Lista "${list.name}" criada.`,
      );
      if (!created) return;
      setLists((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedId(created.id);
    },
    [run, orgSlug],
  );

  const importCsv = React.useCallback(
    async (input: ImportCsvInput) => {
      setReport(null);
      const result = await run(() => postImport(orgSlug, selectedId, input), importSummary);
      if (result) setReport(result);
      await loadMembers();
    },
    [run, orgSlug, selectedId, loadMembers],
  );

  const listState = { lists, selectedId, setSelectedId, report };
  return { ...view, ...listState, pending, feedback, createList, importCsv, rejectLocally };
}
