import * as React from 'react';
import type { KnowledgeManagement } from './use-knowledge-management';
import { KnowledgeEditDialog } from './knowledge-edit-dialog';
import { KnowledgeAssociateDialog } from './knowledge-associate-dialog';
import { KnowledgeLifecycleDialog } from './knowledge-lifecycle-dialog';
import type { KnowledgeDialogTarget } from './use-knowledge-management';

function dialogView(target: KnowledgeDialogTarget | null) {
  const docFor = (action: KnowledgeDialogTarget['action']) =>
    target?.action === action ? target.doc : null;
  const isLifecycle = target?.action === 'restore' || target?.action === 'delete';
  return {
    key: target ? `${target.action}-${target.doc.id}-${target.doc.updatedAt}` : 'closed',
    edit: docFor('edit'),
    associate: docFor('associate'),
    lifecycleAction: isLifecycle ? (target!.action as 'restore' | 'delete') : null,
    lifecycleDoc: isLifecycle ? target!.doc : null,
  };
}

/** Diálogos de edição, associação, restauração e exclusão (DEC-054). */
export function KnowledgeManagementDialogs({
  management,
}: {
  readonly management: KnowledgeManagement;
}) {
  const { target, pending, failure, close } = management;
  const view = dialogView(target);
  return (
    <>
      <KnowledgeEditDialog
        key={`edit-${view.key}`}
        doc={view.edit}
        pending={pending}
        failure={failure}
        onClose={close}
        onSubmit={(edit) => void management.submitEdit(edit)}
      />
      <KnowledgeAssociateDialog
        key={`agent-${view.key}`}
        doc={view.associate}
        agents={management.agents}
        agentsUnavailable={management.agentsUnavailable}
        pending={pending}
        failure={failure}
        onClose={close}
        onSubmit={(agentId) => void management.submitAgent(agentId)}
      />
      <KnowledgeLifecycleDialog
        action={view.lifecycleAction}
        doc={view.lifecycleDoc}
        pending={pending}
        failure={failure}
        onClose={close}
        onConfirm={() => void management.confirmLifecycle()}
      />
    </>
  );
}
