'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@voice-agent/ui';
import type { ContactListSummary } from '../../lib/operations/operations-types';
import { FieldLabel, OPERATION_FIELD, OperationFeedback } from '../operations/operation-feedback';
import { ContactImportForm } from './contact-import-form';
import { ContactImportReportView } from './contact-import-report';
import { ContactListCreateForm } from './contact-list-create-form';
import { ContactMembersTable } from './contact-members-table';
import { useContactLists, type MemberEligibility } from './use-contact-lists';

const FILE_TOO_LARGE = 'O arquivo excede 2 MB. Divida-o em partes menores.';

interface ContactListsPanelProps {
  readonly orgSlug: string;
  readonly canManage: boolean;
  readonly initialLists: readonly ContactListSummary[];
}

export function ContactListsPanel({ orgSlug, canManage, initialLists }: ContactListsPanelProps) {
  const state = useContactLists(orgSlug, initialLists);
  return (
    <Card className="border-border/60 shadow-xs" data-testid="contact-lists-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Listas de contatos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && <ContactListCreateForm pending={state.pending} onCreate={state.createList} />}
        {state.lists.length === 0 ? (
          <p data-testid="contact-lists-empty" className="text-sm text-muted-foreground">
            Nenhuma lista criada ainda.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="contact-list-select">Lista</FieldLabel>
              <select
                id="contact-list-select"
                className={`${OPERATION_FIELD} w-full`}
                value={state.selectedId}
                onChange={(e) => state.setSelectedId(e.target.value)}
              >
                {state.lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="contact-list-eligibility">Exibir</FieldLabel>
              <select
                id="contact-list-eligibility"
                className={`${OPERATION_FIELD} w-full`}
                value={state.eligibility}
                onChange={(e) => state.setEligibility(e.target.value as MemberEligibility)}
              >
                <option value="ELIGIBLE">Somente elegíveis</option>
                <option value="ALL">Todos (inclui suprimidos)</option>
              </select>
            </div>
          </div>
        )}
        {canManage && state.selectedId && (
          <ContactImportForm
            pending={state.pending}
            onTooLarge={() => state.rejectLocally(FILE_TOO_LARGE)}
            onImport={(input) => void state.importCsv(input)}
          />
        )}
        <OperationFeedback state={state.feedback} testId="contact-lists-feedback" />
        {state.report && <ContactImportReportView report={state.report} />}
        {state.selectedId && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Exibindo até 100 contatos.</p>
            <ContactMembersTable members={state.members} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
