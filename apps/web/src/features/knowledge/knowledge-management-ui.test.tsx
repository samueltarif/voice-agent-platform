import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { KnowledgeDocumentList } from './knowledge-document-list';
import { KnowledgeEditDialog } from './knowledge-edit-dialog';
import { KnowledgeAssociateDialog } from './knowledge-associate-dialog';
import { KnowledgeLifecycleDialog } from './knowledge-lifecycle-dialog';
import { knowledgeManagePermissions } from './knowledge-document-actions';
import { KNOWLEDGE_TEST_DOC, KNOWLEDGE_TEST_FILTERS } from './knowledge-test-fixtures';
import type { KnowledgeOperationFailure } from './knowledge-operation-failure';

// Mesmo recurso do teste do diálogo de arquivamento: conteúdo do diálogo sem portal no SSR.
vi.mock('@voice-agent/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@voice-agent/ui')>();
  return {
    ...actual,
    DialogContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', props, children),
    DialogTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) =>
      React.createElement('h2', props, children),
    DialogDescription: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) =>
      React.createElement('p', props, children),
  };
});

const AGENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const noop = () => undefined;

function list(role: string, docs = [KNOWLEDGE_TEST_DOC]) {
  return renderToString(
    <KnowledgeDocumentList
      documents={docs}
      isLoading={false}
      filters={KNOWLEDGE_TEST_FILTERS}
      offset={0}
      canIngest
      canArchive={false}
      onFiltersChange={noop}
      onPageChange={noop}
      onAdd={noop}
      onArchive={noop}
      manage={{
        permissions: knowledgeManagePermissions(role),
        agentNames: new Map([[AGENT, 'Atendente Qualitec']]),
        onAction: noop,
      }}
    />,
  );
}

describe('knowledge list with management (DEC-054)', () => {
  it('shows the actions menu to OWNER and MANAGER, never to VIEWER', () => {
    expect(list('OWNER')).toContain(`kb-actions-${KNOWLEDGE_TEST_DOC.id}`);
    expect(list('MANAGER')).toContain(`kb-actions-${KNOWLEDGE_TEST_DOC.id}`);
    const viewer = list('VIEWER');
    expect(viewer).not.toContain('kb-actions-');
    expect(viewer).not.toContain('Ações para');
  });

  it('offers the menu on archived documents (restore) instead of hiding it', () => {
    const html = list('ADMIN', [{ ...KNOWLEDGE_TEST_DOC, status: 'ARCHIVED' }]);
    expect(html).toContain(`aria-label="Ações para ${KNOWLEDGE_TEST_DOC.title}"`);
  });

  it('names the associated agent on desktop and mobile', () => {
    const html = list('ADMIN', [{ ...KNOWLEDGE_TEST_DOC, agentId: AGENT }]);
    expect(html.match(/Atendente Qualitec/g)).toHaveLength(2);
    expect(html).not.toContain('aaaaaaaa…');
  });
});

describe('management dialogs', () => {
  const failure: KnowledgeOperationFailure = {
    status: 409,
    code: 'KNOWLEDGE_STALE_UPDATE',
    message: 'O documento foi alterado depois que a lista foi carregada.',
    reloadHint: true,
  };

  it('edit dialog shows the current values, the replace-content option and the error', () => {
    const html = renderToString(
      <KnowledgeEditDialog
        doc={{
          ...KNOWLEDGE_TEST_DOC,
          source: { ...KNOWLEDGE_TEST_DOC.source, sourceVersion: 'v3' },
        }}
        pending={false}
        failure={failure}
        onClose={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('Editar documento');
    expect(html).toContain(`value="${KNOWLEDGE_TEST_DOC.title}"`);
    expect(html).toContain('value="suporte"');
    expect(html).toContain('value="v3"');
    expect(html).toContain('Substituir o conteúdo');
    expect(html).toContain('role="alert"');
    expect(html).toContain('atualize a página');
  });
});

describe('association and lifecycle dialogs', () => {
  it('associate dialog lists only active agents of the organization plus "all agents"', () => {
    const html = renderToString(
      <KnowledgeAssociateDialog
        doc={KNOWLEDGE_TEST_DOC}
        agents={[
          { id: AGENT, name: 'Atendente Qualitec', status: 'ACTIVE' },
          { id: 'b', name: 'Agente antigo', status: 'ARCHIVED' },
        ]}
        agentsUnavailable={false}
        pending={false}
        failure={null}
        onClose={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('Todos os agentes da organização');
    expect(html).toContain('Atendente Qualitec');
    expect(html).not.toContain('Agente antigo');
    expect(html).toContain('<label for="kb-agent"');
  });

  it('associate dialog explains when agents cannot be loaded', () => {
    const html = renderToString(
      <KnowledgeAssociateDialog
        doc={KNOWLEDGE_TEST_DOC}
        agents={[]}
        agentsUnavailable
        pending={false}
        failure={null}
        onClose={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('Não foi possível carregar a lista de agentes');
  });

  it('delete dialog is explicit about permanence and audit; restore about the content', () => {
    const del = renderToString(
      <KnowledgeLifecycleDialog
        action="delete"
        doc={KNOWLEDGE_TEST_DOC}
        pending
        failure={null}
        onClose={noop}
        onConfirm={noop}
      />,
    );
    expect(del).toContain('Excluir definitivamente');
    expect(del).toContain('não poderão ser restaurados');
    expect(del).toContain('auditoria');
    expect(del).toContain('Excluindo...');
    const restore = renderToString(
      <KnowledgeLifecycleDialog
        action="restore"
        doc={KNOWLEDGE_TEST_DOC}
        pending={false}
        failure={null}
        onClose={noop}
        onConfirm={noop}
      />,
    );
    expect(restore).toContain('Restaurar documento');
    expect(restore).toContain('mesmo conteúdo');
  });
});
