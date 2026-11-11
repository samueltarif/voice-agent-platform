import * as React from 'react';
import type { KnowledgeDocumentResponse } from '@voice-agent/contracts';
import {
  deleteKnowledgeDocument,
  restoreKnowledgeDocument,
  setKnowledgeDocumentAgent,
  updateKnowledgeDocument,
  type KnowledgeDocumentEdit,
  type OrganizationAgentOption,
} from '../../lib/knowledge/knowledge-document-management-client';
import type { KnowledgeListRequest } from './use-knowledge-list';
import type { KnowledgeOperationFailure } from './knowledge-operation-failure';
import { useOrganizationAgents } from './use-organization-agents';
import { useKnowledgeOperationRunner } from './use-knowledge-operation-runner';

export type KnowledgeDialogAction = 'edit' | 'associate' | 'restore' | 'delete';

export interface KnowledgeDialogTarget {
  readonly action: KnowledgeDialogAction;
  readonly doc: KnowledgeDocumentResponse;
}

export interface KnowledgeManagement {
  readonly target: KnowledgeDialogTarget | null;
  readonly pending: boolean;
  readonly failure: KnowledgeOperationFailure | null;
  readonly toast: string | null;
  readonly agents: readonly OrganizationAgentOption[];
  readonly agentsUnavailable: boolean;
  readonly agentNames: ReadonlyMap<string, string>;
  readonly open: (action: KnowledgeDialogAction, doc: KnowledgeDocumentResponse) => void;
  readonly close: () => void;
  readonly submitEdit: (edit: KnowledgeDocumentEdit) => Promise<void>;
  readonly submitAgent: (agentId: string | null) => Promise<void>;
  readonly confirmLifecycle: () => Promise<void>;
}

export interface KnowledgeManagementOptions {
  readonly orgSlug: string;
  readonly enabled: boolean;
  readonly reload: (request?: KnowledgeListRequest) => Promise<void>;
  readonly currentQuery: () => KnowledgeListRequest;
}

function agentSuccessMessage(agentId: string | null, names: ReadonlyMap<string, string>): string {
  if (!agentId) return 'Documento disponível para todos os agentes da organização.';
  return `Documento associado ao agente "${names.get(agentId) ?? 'selecionado'}".`;
}

function editSuccessMessage(edit: KnowledgeDocumentEdit): string {
  return edit.rawText
    ? 'Documento atualizado. O novo conteúdo já substituiu o anterior na busca.'
    : 'Documento atualizado com sucesso.';
}

/** Estado e ações dos diálogos de gestão da Base de Conhecimento (DEC-054). */
export function useKnowledgeManagement(options: KnowledgeManagementOptions): KnowledgeManagement {
  const { orgSlug } = options;
  const runner = useKnowledgeOperationRunner<KnowledgeDialogTarget>(options);
  const agents = useOrganizationAgents(options.enabled);
  const { target, run } = runner;
  const doc = target?.doc;

  const submitEdit = React.useCallback(
    async (edit: KnowledgeDocumentEdit) => {
      if (doc)
        await run(() => updateKnowledgeDocument(orgSlug, doc, edit), editSuccessMessage(edit));
    },
    [doc, orgSlug, run],
  );
  const submitAgent = React.useCallback(
    async (agentId: string | null) => {
      if (!doc) return;
      const message = agentSuccessMessage(agentId, agents.names);
      await run(() => setKnowledgeDocumentAgent(orgSlug, doc, agentId), message);
    },
    [doc, orgSlug, run, agents.names],
  );
  const confirmLifecycle = React.useCallback(async () => {
    if (!doc) return;
    if (target?.action === 'restore') {
      await run(() => restoreKnowledgeDocument(orgSlug, doc), 'Documento restaurado e disponível.');
    } else if (target?.action === 'delete') {
      await run(() => deleteKnowledgeDocument(orgSlug, doc), 'Documento excluído definitivamente.');
    }
  }, [doc, target, orgSlug, run]);

  return {
    target,
    pending: runner.pending,
    failure: runner.failure,
    toast: runner.toast,
    agents: agents.agents,
    agentsUnavailable: agents.unavailable,
    agentNames: agents.names,
    open: (action, d) => runner.open({ action, doc: d }),
    close: runner.close,
    submitEdit,
    submitAgent,
    confirmLifecycle,
  };
}
