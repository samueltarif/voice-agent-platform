import * as React from 'react';
import type { KnowledgeRetrievalComparison } from '@voice-agent/contracts';
import { compareKnowledgeRetrieval } from '../../lib/knowledge/knowledge-retrieval-comparison-client';
import {
  describeKnowledgeFailure,
  type KnowledgeOperationFailure,
} from './knowledge-operation-failure';

export interface KnowledgeRetrievalComparisonState {
  readonly pending: boolean;
  readonly result: KnowledgeRetrievalComparison | null;
  readonly failure: KnowledgeOperationFailure | null;
  readonly run: (input: { queryText: string; agentId: string }) => Promise<void>;
}

/** Comparação v1 × v2 (DEC-067) com a mesma pergunta e escopo do teste de recuperação. */
export function useKnowledgeRetrievalComparison(
  orgSlug: string,
): KnowledgeRetrievalComparisonState {
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<KnowledgeRetrievalComparison | null>(null);
  const [failure, setFailure] = React.useState<KnowledgeOperationFailure | null>(null);

  const run = React.useCallback(
    async (input: { queryText: string; agentId: string }) => {
      const text = input.queryText.trim();
      if (!text || pending) return;
      setPending(true);
      setFailure(null);
      try {
        const body = { queryText: text, ...(input.agentId ? { agentId: input.agentId } : {}) };
        setResult(await compareKnowledgeRetrieval(orgSlug, body));
      } catch (error) {
        setResult(null);
        setFailure(describeKnowledgeFailure(error));
      } finally {
        setPending(false);
      }
    },
    [pending, orgSlug],
  );

  return { pending, result, failure, run };
}
