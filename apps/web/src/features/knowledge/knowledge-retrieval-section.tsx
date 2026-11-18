import * as React from 'react';
import type { OrganizationAgentOption } from '../../lib/knowledge/knowledge-document-management-client';
import { KnowledgeRetrievalPreviewPanel } from './knowledge-retrieval-preview-panel';
import { KnowledgeRetrievalComparisonPanel } from './knowledge-retrieval-comparison-panel';
import type { KnowledgeRetrievalPreviewState } from './use-knowledge-retrieval-preview';

/** Teste de recuperação (DEC-055) + comparação v1 × v2 só para OWNER/ADMIN (DEC-067). */
export function KnowledgeRetrievalSection(props: {
  readonly orgSlug: string;
  readonly role: string | undefined;
  readonly preview: KnowledgeRetrievalPreviewState;
  readonly agents: readonly OrganizationAgentOption[];
}) {
  return (
    <>
      <KnowledgeRetrievalPreviewPanel state={props.preview} agents={props.agents} />
      <KnowledgeRetrievalComparisonPanel
        orgSlug={props.orgSlug}
        role={props.role}
        preview={props.preview}
      />
    </>
  );
}
