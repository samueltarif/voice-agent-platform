import * as React from 'react';
import type { KnowledgeRetrievalPreview } from '@voice-agent/contracts';
import { previewKnowledgeRetrieval } from '../../lib/knowledge/knowledge-retrieval-preview-client';
import {
  describeKnowledgeFailure,
  type KnowledgeOperationFailure,
} from './knowledge-operation-failure';

export const ORGANIZATION_SCOPE = '';

export interface KnowledgeRetrievalPreviewState {
  readonly queryText: string;
  readonly agentId: string;
  readonly pending: boolean;
  readonly result: KnowledgeRetrievalPreview | null;
  readonly failure: KnowledgeOperationFailure | null;
  readonly setQueryText: (value: string) => void;
  readonly setAgentId: (value: string) => void;
  readonly run: () => Promise<void>;
}

/** Estado do teste de recuperação: pergunta, escopo (agente ou organização) e resultado. */
export function useKnowledgeRetrievalPreview(orgSlug: string): KnowledgeRetrievalPreviewState {
  const [queryText, setQueryText] = React.useState('');
  const [agentId, setAgentId] = React.useState(ORGANIZATION_SCOPE);
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<KnowledgeRetrievalPreview | null>(null);
  const [failure, setFailure] = React.useState<KnowledgeOperationFailure | null>(null);

  const run = React.useCallback(async () => {
    const text = queryText.trim();
    if (!text || pending) return;
    setPending(true);
    setFailure(null);
    try {
      const body = { queryText: text, ...(agentId ? { agentId } : {}) };
      setResult(await previewKnowledgeRetrieval(orgSlug, body));
    } catch (error) {
      setResult(null);
      setFailure(describeKnowledgeFailure(error));
    } finally {
      setPending(false);
    }
  }, [queryText, agentId, pending, orgSlug]);

  return { queryText, agentId, pending, result, failure, setQueryText, setAgentId, run };
}
